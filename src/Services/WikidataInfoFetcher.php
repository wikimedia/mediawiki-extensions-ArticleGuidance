<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Extension\ArticleGuidance\WikidataProperties;
use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Language\LanguageFactory;
use Psr\Log\LoggerInterface;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * Service for fetching Wikidata entity information including labels, descriptions,
 * images, and hierarchy depth via concurrent API calls
 */
class WikidataInfoFetcher {

	public function __construct(
		private readonly HttpRequestFactory $httpRequestFactory,
		private readonly LanguageFactory $languageFactory,
		private readonly LoggerInterface $logger,
		private readonly WANObjectCache $cache,
		private readonly array $matchViaRules,
		private readonly string $userAgent,
		private readonly WikidataUrls $wikidataUrls,
		private readonly CommonsThumb $commonsThumb,
	) {
	}

	/**
	 * Fetch Wikidata entities with caching, including hierarchy depth and match-via.
	 *
	 * The IDs that are not in the cache are fetched together: one wbgetentities
	 * request and one SPARQL query for all of them, sent concurrently. If the
	 * SPARQL query fails, each of these IDs gets no hierarchy depth.
	 *
	 * When $matchVia is null, the match-via property is inferred from Wikidata superclasses
	 * using the configured ArticleGuidanceMatchViaRules. Both P279 and P171 ancestor
	 * counts are computed in one SPARQL query and the correct one is selected based on
	 * the inferred property. This prevents Q5 (human) from getting an inflated depth via
	 * its long biological P171 ancestry when matched via P31/P279.
	 *
	 * @param string[] $wikidataIds Unique Wikidata Q IDs, at most 50 (the wbgetentities limit)
	 * @param string $languageCode Language code
	 * @param string|null $matchVia Explicit match-via override, or null to infer
	 * @return array<string,array|null> Entity data by Q ID, or null on failure. Entity data
	 *   has 'label', 'description', 'image', 'matchVia' (null means use default P31/P279
	 *   path), and 'hierarchyDepth'.
	 */
	public function fetchEntitiesCached( array $wikidataIds, string $languageCode, ?string $matchVia = null ): array {
		if ( $wikidataIds === [] ) {
			return [];
		}
		$values = $this->cache->getMultiWithUnionSetCallback(
			$this->cache->makeMultiKeys(
				$wikidataIds,
				// Cache key version - increment to invalidate old cache entries
				fn ( string $id ) => $this->cache->makeKey(
					'articleguidance', 'wikidata', $id, $languageCode, $matchVia ?? 'infer', 'v11'
				)
			),
			WANObjectCache::TTL_WEEK,
			fn ( array $ids, array &$ttls ) => $this->fetchEntities( $ids, $languageCode, $matchVia, $ttls ),
			[ 'pcTTL' => WANObjectCache::TTL_PROC_LONG ]
		);
		return array_combine( $wikidataIds, array_values( $values ) );
	}

	/**
	 * @param string[] $ids Wikidata Q IDs
	 * @param string $languageCode Language code
	 * @param string|null $matchVia Explicit match-via override, or null to infer
	 * @param int[] &$ttls Cache TTL by Q ID
	 * @return array<string,array|null> Entity data by Q ID, or null on failure
	 */
	private function fetchEntities( array $ids, string $languageCode, ?string $matchVia, array &$ttls ): array {
		$wbgetentitiesReq = [
			'method' => 'GET',
			'url' => $this->wikidataUrls->getApiUrl( [
				'action' => 'wbgetentities',
				'props' => 'labels|descriptions|claims',
				'ids' => implode( '|', $ids ),
				'languages' => $languageCode,
				'languagefallback' => '1',
				'format' => 'json'
			] )
		];
		$sparqlQuery = $matchVia !== null
			? $this->buildDepthSparql( $ids, $matchVia )
			: $this->buildInferenceAndDepthSparql( $ids );
		$responses = $this->httpRequestFactory->createMultiClient()->runMulti(
			[ $wbgetentitiesReq, $this->buildSparqlRequest( $sparqlQuery ) ],
			[],
			__METHOD__
		);

		$entities = $this->processWbgetentitiesResponse( $responses[0]['response'], $languageCode );
		$depths = $matchVia !== null
			? $this->processDepthSparqlResponse( $responses[1]['response'], $matchVia )
			: $this->processInferenceAndDepthSparqlResponse( $responses[1]['response'] );

		$results = [];
		foreach ( $ids as $id ) {
			$entityData = $entities[$id] ?? null;
			$depthData = $depths[$id] ?? [ 'matchVia' => $matchVia, 'hierarchyDepth' => null ];
			if ( $entityData === null || $depthData['hierarchyDepth'] === null ) {
				// Retry a failure soon
				$ttls[$id] = WANObjectCache::TTL_MINUTE * 5;
			}
			$results[$id] = $entityData === null ? null : $entityData + $depthData;
		}
		return $results;
	}

	/**
	 * Process wbgetentities API response
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @param string $languageCode Language code
	 * @return array<string,array|null> Label, description, and image by Q ID, or null for
	 *   an entity with none of them. Empty on failure.
	 */
	private function processWbgetentitiesResponse( array $response, string $languageCode ): array {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->error( 'wbgetentities request failed', [
				'code' => $code,
				'error' => $error,
			] );
			return [];
		}

		$data = json_decode( $body, true );
		if ( !is_array( $data ) || !is_array( $data['entities'] ?? null ) ) {
			$this->logger->error( 'Invalid Wikidata API response format' );
			return [];
		}

		$entities = [];
		foreach ( $data['entities'] as $id => $entity ) {
			$entities[$id] = is_array( $entity ) ? $this->processEntity( $entity, $languageCode ) : null;
		}
		return $entities;
	}

	/**
	 * @param array $entity Entity from a wbgetentities response
	 * @param string $languageCode Language code
	 * @return array|null Array with label, description, and image, or null if it has none of them
	 */
	private function processEntity( array $entity, string $languageCode ): ?array {
		$labelData = $entity['labels'][$languageCode] ?? null;
		$label = $labelData['value'] ?? null;
		if ( $label !== null ) {
			// Capitalize using the actual language returned by the API (may differ
			// from $languageCode because of language fallback).
			$labelLanguage = $this->languageFactory->getLanguage( $labelData['language'] ?? $languageCode );
			$label = $labelLanguage->ucfirst( $label );
		}
		$description = $entity['descriptions'][$languageCode]['value'] ?? null;

		// Extract image from P18 claim
		$image = null;
		if ( isset( $entity['claims'][WikidataProperties::PROP_IMAGE][0]['mainsnak']['datavalue']['value'] ) ) {
			$imageName = $entity['claims'][WikidataProperties::PROP_IMAGE][0]['mainsnak']['datavalue']['value'];
			$image = $this->commonsThumb->getUrl( $imageName );
		}

		// Return null if we got no useful data
		if ( !$label && !$description && !$image ) {
			return null;
		}

		return [
			'label' => $label,
			'description' => $description,
			'image' => $image,
		];
	}

	/**
	 * Build a SPARQL HTTP request array for MultiHttpClient
	 *
	 * @param string $sparqlQuery SPARQL query string
	 * @return array Request array
	 */
	private function buildSparqlRequest( string $sparqlQuery ): array {
		return [
			'method' => 'GET',
			'url' => $this->wikidataUrls->getSparqlUrl( [
				'query' => $sparqlQuery,
				'format' => 'json'
			] ),
			'headers' => [
				'User-Agent' => $this->userAgent,
				'Accept' => 'application/sparql-results+json'
			]
		];
	}

	/**
	 * Build a SPARQL query that counts the ancestors of each item along one property chain.
	 * P171 outlines count P171 ancestors; all others count P279 ancestors.
	 *
	 * @param string[] $ids Wikidata Q IDs
	 * @param string $matchVia Explicit match-via property
	 * @return string SPARQL query
	 */
	private function buildDepthSparql( array $ids, string $matchVia ): string {
		$depthProperty = $matchVia === WikidataProperties::PROP_PARENT_TAXON
			? WikidataProperties::PROP_PARENT_TAXON
			: WikidataProperties::PROP_SUBCLASS_OF;
		$values = $this->buildValuesClause( $ids );

		return "SELECT ?item (COUNT(?intermediate) AS ?depth) WHERE {
  $values
  ?item wdt:$depthProperty* ?intermediate .
}
GROUP BY ?item";
	}

	/**
	 * Build a SPARQL query that infers match-via from superclasses and computes
	 * both P279 and P171 ancestor depths of each item in one request.
	 *
	 * Rules from $this->matchViaRules are evaluated in config order via wdt:P31/wdt:P279*;
	 * the first matching superclass wins. An 'exclude' condition prevents a rule from
	 * firing when the entity is also a subclass of the excluded Q-ID.
	 * An empty string result means use the default P31/P279 path.
	 *
	 * @param string[] $ids Wikidata Q IDs
	 * @return string SPARQL query
	 */
	private function buildInferenceAndDepthSparql( array $ids ): string {
		$p31 = WikidataProperties::PROP_INSTANCE_OF;
		$p279 = WikidataProperties::PROP_SUBCLASS_OF;
		$p171 = WikidataProperties::PROP_PARENT_TAXON;
		$path = "wdt:$p31/wdt:$p279*";

		// Build a nested IF/EXISTS expression; rules are evaluated outermost-first
		// so we accumulate from innermost (last rule) to outermost (first rule).
		$matchViaExpr = '""';
		foreach ( array_reverse( $this->matchViaRules ) as $rule ) {
			$condition = "EXISTS { ?item $path wd:{$rule['superclass']} }";
			$then = "\"{$rule['matchVia']}\"";
			if ( isset( $rule['exclude'] ) ) {
				$excludeCondition = "EXISTS { ?item wdt:$p279* wd:{$rule['exclude']} }";
				$then = "IF($excludeCondition, $matchViaExpr, $then)";
			}
			$matchViaExpr = "IF($condition, $then, $matchViaExpr)";
		}
		$values = $this->buildValuesClause( $ids );

		return "SELECT ?item ?inferredMatchVia
  (COUNT(DISTINCT ?p279node) AS ?p279depth)
  (COUNT(DISTINCT ?p171node) AS ?p171depth)
WHERE {
  $values
  BIND($matchViaExpr AS ?inferredMatchVia)
  OPTIONAL { ?item wdt:$p279* ?p279node }
  OPTIONAL { ?item wdt:$p171* ?p171node }
}
GROUP BY ?item ?inferredMatchVia";
	}

	/**
	 * @param string[] $ids Wikidata Q IDs
	 * @return string SPARQL VALUES clause that binds ?item to each ID
	 */
	private function buildValuesClause( array $ids ): string {
		return 'VALUES ?item { ' . implode( ' ', array_map( static fn ( string $id ) => "wd:$id", $ids ) ) . ' }';
	}

	/**
	 * Process the combined inference+depth SPARQL response.
	 * Returns inferred match-via (null means default) and the depth along the correct chain.
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @return array<string,array{matchVia: string|null, hierarchyDepth: int|null}> By Q ID.
	 *   Empty on failure.
	 */
	private function processInferenceAndDepthSparqlResponse( array $response ): array {
		$depths = [];
		foreach ( $this->getSparqlBindingsByItem( $response ) as $id => $binding ) {
			$inferredMatchVia = ( $binding['inferredMatchVia']['value'] ?? '' ) ?: null;
			$depthKey = $inferredMatchVia === WikidataProperties::PROP_PARENT_TAXON ? 'p171depth' : 'p279depth';
			$depths[$id] = [
				'matchVia' => $inferredMatchVia,
				'hierarchyDepth' => isset( $binding[$depthKey]['value'] )
					? (int)$binding[$depthKey]['value']
					: null,
			];
		}
		return $depths;
	}

	/**
	 * Process SPARQL response for hierarchy depth with graceful degradation
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @param string $matchVia Explicit match-via property
	 * @return array<string,array{matchVia: string, hierarchyDepth: int|null}> By Q ID.
	 *   Hierarchy depth is the ancestor count along the relevant property chain. Empty on failure.
	 */
	private function processDepthSparqlResponse( array $response, string $matchVia ): array {
		$depths = [];
		foreach ( $this->getSparqlBindingsByItem( $response ) as $id => $binding ) {
			$depths[$id] = [
				'matchVia' => $matchVia,
				'hierarchyDepth' => isset( $binding['depth']['value'] ) ? (int)$binding['depth']['value'] : null,
			];
		}
		return $depths;
	}

	/**
	 * @param array $response Response array from MultiHttpClient
	 * @return array<string,array> SPARQL result bindings by the Q ID in ?item. Empty on failure.
	 */
	private function getSparqlBindingsByItem( array $response ): array {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->warning( 'Failed to fetch outline hierarchy depth (code !== 200)', [
				'code' => $code,
				'error' => $error
			] );
			return [];
		}

		$data = json_decode( $body, true );
		if ( !is_array( $data ) || !is_array( $data['results']['bindings'] ?? null ) ) {
			$this->logger->warning( 'Failed to fetch outline hierarchy depth (unexpected body)', [
				'body' => substr( $body, 0, 200 )
			] );
			return [];
		}

		$bindings = [];
		foreach ( $data['results']['bindings'] as $binding ) {
			// ?item is an entity URI, e.g. http://www.wikidata.org/entity/Q5
			if ( preg_match( '/\/(Q\d+)$/', $binding['item']['value'] ?? '', $matches ) ) {
				$bindings[$matches[1]] = $binding;
			}
		}
		return $bindings;
	}
}
