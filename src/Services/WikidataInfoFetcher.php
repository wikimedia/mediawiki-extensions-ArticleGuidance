<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Extension\ArticleGuidance\WikidataProperties;
use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Language\Language;
use Psr\Log\LoggerInterface;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * Service for fetching Wikidata entity information including labels, descriptions,
 * images, and hierarchy depth via concurrent API calls
 */
class WikidataInfoFetcher {

	private const THUMB_WIDTH = 60;

	public function __construct(
		private readonly HttpRequestFactory $httpRequestFactory,
		private readonly Language $contentLanguage,
		private readonly LoggerInterface $logger,
		private readonly WANObjectCache $cache,
		private readonly array $matchViaRules,
	) {
	}

	/**
	 * Convert a Wikimedia Commons image filename to a thumbnail URL
	 *
	 * @param string $filename Image filename from Wikidata
	 * @return string Thumbnail URL
	 */
	private function getCommonsImageUrl( string $filename ): string {
		// Replace spaces with underscores
		$filename = str_replace( ' ', '_', $filename );

		// Create MD5 hash for directory structure
		$md5 = md5( $filename );
		$dir1 = substr( $md5, 0, 1 );
		$dir2 = substr( $md5, 0, 2 );

		// Build Commons thumbnail URL
		return sprintf(
			'https://upload.wikimedia.org/wikipedia/commons/thumb/%s/%s/%s/%dpx-%s',
			$dir1,
			$dir2,
			rawurlencode( $filename ),
			self::THUMB_WIDTH,
			rawurlencode( $filename )
		);
	}

	/**
	 * Fetch a single Wikidata entity with caching, including hierarchy depth and match-via.
	 *
	 * Fetches label, description, image, hierarchy depth, and match-via concurrently
	 * using MultiHttpClient for optimal performance.
	 *
	 * When $matchVia is null, the match-via property is inferred from Wikidata superclasses
	 * using the configured ArticleGuidanceMatchViaRules. Both P279 and P171 ancestor
	 * counts are computed in one SPARQL query and the correct one is selected based on
	 * the inferred property. This prevents Q5 (human) from getting an inflated depth via
	 * its long biological P171 ancestry when matched via P31/P279.
	 *
	 * @param string $wikidataId Wikidata Q ID
	 * @param string $languageCode Language code
	 * @param string|null $matchVia Explicit match-via override, or null to infer
	 * @return array|null Array with 'label', 'description', 'image', 'hierarchyDepth',
	 *   and 'matchVia' (null means use default P31/P279 path), or null on failure
	 */
	public function fetchEntityCached( string $wikidataId, string $languageCode, ?string $matchVia = null ): ?array {
		// Cache key version - increment to invalidate old cache entries
		$cacheKey = $this->cache->makeKey(
			'articleguidance', 'wikidata', $wikidataId, $languageCode, $matchVia ?? 'infer', 'v8'
		);
		$method = __METHOD__;

		return $this->cache->getWithSetCallback(
			$cacheKey,
			WANObjectCache::TTL_WEEK,
			function ( $oldValue, &$ttl, &$setOpts ) use ( $wikidataId, $languageCode, $matchVia, $method ) {
				$multiClient = $this->httpRequestFactory->createMultiClient();

				// Request 1: wbgetentities for label/description/image
				$wbgetentitiesReq = [
					'method' => 'GET',
					'url' => 'https://www.wikidata.org/w/api.php?' . http_build_query( [
						'action' => 'wbgetentities',
						'props' => 'labels|descriptions|claims',
						'ids' => $wikidataId,
						'languages' => $languageCode,
						'format' => 'json'
					] )
				];

				if ( $matchVia !== null ) {
					// Explicit match-via: simple depth query along the known property chain.
					// P171 outlines count P171 ancestors; all others count P279 ancestors.
					$depthProperty = $matchVia === WikidataProperties::PROP_PARENT_TAXON
						? WikidataProperties::PROP_PARENT_TAXON
						: WikidataProperties::PROP_SUBCLASS_OF;
					$sparqlQuery = "SELECT (COUNT(?intermediate) as ?depth) WHERE {
						wd:{$wikidataId} wdt:{$depthProperty}* ?intermediate .
					}";
					$sparqlReq = $this->buildSparqlRequest( $sparqlQuery );
					$responses = $multiClient->runMulti( [ $wbgetentitiesReq, $sparqlReq ], [], $method );

					$entityData = $this->processWbgetentitiesResponse(
						$responses[0]['response'], $wikidataId, $languageCode
					);
					if ( !$entityData ) {
						$ttl = WANObjectCache::TTL_MINUTE * 5;
						return null;
					}
					$entityData['matchVia'] = $matchVia;
					$entityData['hierarchyDepth'] = $this->processSparqlResponse( $responses[1]['response'] );
				} else {
					// No explicit match-via: infer from Wikidata superclasses and compute
					// both P171 and P279 depths in a single SPARQL query.
					$sparqlQuery = $this->buildInferenceAndDepthSparql( $wikidataId );
					$sparqlReq = $this->buildSparqlRequest( $sparqlQuery );
					$responses = $multiClient->runMulti( [ $wbgetentitiesReq, $sparqlReq ], [], $method );

					$entityData = $this->processWbgetentitiesResponse(
						$responses[0]['response'], $wikidataId, $languageCode
					);
					if ( !$entityData ) {
						$ttl = WANObjectCache::TTL_MINUTE * 5;
						return null;
					}
					[ 'matchVia' => $inferredMatchVia, 'hierarchyDepth' => $hierarchyDepth ] =
						$this->processInferenceAndDepthSparqlResponse( $responses[1]['response'] );
					$entityData['matchVia'] = $inferredMatchVia;
					$entityData['hierarchyDepth'] = $hierarchyDepth;
				}

				return $entityData;
			},
			[
				'pcTTL' => WANObjectCache::TTL_PROC_LONG,
				'lockTSE' => 30,
			]
		);
	}

	/**
	 * Process wbgetentities API response
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @param string $wikidataId Wikidata ID being fetched
	 * @param string $languageCode Language code
	 * @return array|null Array with label, description, and image, or null on failure
	 */
	private function processWbgetentitiesResponse( array $response, string $wikidataId, string $languageCode ): ?array {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->error( 'wbgetentities request failed', [
				'code' => $code,
				'error' => $error,
				'wikidataId' => $wikidataId
			] );
			return null;
		}

		$data = json_decode( $body, true );
		if ( !is_array( $data ) || !isset( $data['entities'][$wikidataId] ) ) {
			$this->logger->error( 'Invalid Wikidata API response format', [
				'wikidataId' => $wikidataId
			] );
			return null;
		}

		$entity = $data['entities'][$wikidataId];
		$label = $entity['labels'][$languageCode]['value'] ?? null;
		$description = $entity['descriptions'][$languageCode]['value'] ?? null;

		// Extract image from P18 claim
		$image = null;
		if ( isset( $entity['claims'][WikidataProperties::PROP_IMAGE][0]['mainsnak']['datavalue']['value'] ) ) {
			$imageName = $entity['claims'][WikidataProperties::PROP_IMAGE][0]['mainsnak']['datavalue']['value'];
			$image = $this->getCommonsImageUrl( $imageName );
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
			'url' => 'https://query.wikidata.org/sparql?' . http_build_query( [
				'query' => $sparqlQuery,
				'format' => 'json'
			] ),
			'headers' => [
				'User-Agent' => 'MediaWiki ArticleGuidance Extension',
				'Accept' => 'application/sparql-results+json'
			]
		];
	}

	/**
	 * Build a SPARQL query that infers match-via from superclasses and computes
	 * both P279 and P171 ancestor depths in one request.
	 *
	 * Rules from $this->matchViaRules are evaluated in config order via wdt:P31/wdt:P279*;
	 * the first matching superclass wins. An 'exclude' condition prevents a rule from
	 * firing when the entity is also a subclass of the excluded Q-ID.
	 * An empty string result means use the default P31/P279 path.
	 *
	 * @param string $wikidataId Wikidata Q ID
	 * @return string SPARQL query
	 */
	private function buildInferenceAndDepthSparql( string $wikidataId ): string {
		$p31 = WikidataProperties::PROP_INSTANCE_OF;
		$p279 = WikidataProperties::PROP_SUBCLASS_OF;
		$p171 = WikidataProperties::PROP_PARENT_TAXON;
		$path = "wdt:$p31/wdt:$p279*";

		// Build a nested IF/EXISTS expression; rules are evaluated outermost-first
		// so we accumulate from innermost (last rule) to outermost (first rule).
		$matchViaExpr = '""';
		foreach ( array_reverse( $this->matchViaRules ) as $rule ) {
			$condition = "EXISTS { wd:{$wikidataId} $path wd:{$rule['superclass']} }";
			$then = "\"{$rule['matchVia']}\"";
			if ( isset( $rule['exclude'] ) ) {
				$excludeCondition = "EXISTS { wd:{$wikidataId} wdt:$p279* wd:{$rule['exclude']} }";
				$then = "IF($excludeCondition, $matchViaExpr, $then)";
			}
			$matchViaExpr = "IF($condition, $then, $matchViaExpr)";
		}

		return "SELECT ?inferredMatchVia
  (COUNT(DISTINCT ?p279node) AS ?p279depth)
  (COUNT(DISTINCT ?p171node) AS ?p171depth)
WHERE {
  { SELECT ?inferredMatchVia WHERE { BIND($matchViaExpr AS ?inferredMatchVia) } }
  OPTIONAL { wd:{$wikidataId} wdt:$p279* ?p279node }
  OPTIONAL { wd:{$wikidataId} wdt:$p171* ?p171node }
}
GROUP BY ?inferredMatchVia";
	}

	/**
	 * Process the combined inference+depth SPARQL response.
	 * Returns inferred match-via (null means default) and the depth along the correct chain.
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @return array{matchVia: string|null, hierarchyDepth: int|null}
	 */
	private function processInferenceAndDepthSparqlResponse( array $response ): array {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->warning( 'SPARQL inference request failed (graceful degradation)', [
				'code' => $code,
				'error' => $error
			] );
			return [ 'matchVia' => null, 'hierarchyDepth' => null ];
		}

		$data = json_decode( $body, true );
		if ( !is_array( $data ) || !isset( $data['results']['bindings'][0] ) ) {
			return [ 'matchVia' => null, 'hierarchyDepth' => null ];
		}

		$binding = $data['results']['bindings'][0];
		$inferredMatchVia = ( $binding['inferredMatchVia']['value'] ?? '' ) ?: null;
		$depthKey = $inferredMatchVia === WikidataProperties::PROP_PARENT_TAXON ? 'p171depth' : 'p279depth';
		$hierarchyDepth = isset( $binding[$depthKey]['value'] )
			? (int)$binding[$depthKey]['value']
			: null;

		return [ 'matchVia' => $inferredMatchVia, 'hierarchyDepth' => $hierarchyDepth ];
	}

	/**
	 * Process SPARQL response for hierarchy depth with graceful degradation
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @return int|null Hierarchy depth (ancestor count along the relevant property chain), or null on failure
	 */
	private function processSparqlResponse( array $response ): ?int {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->warning( 'SPARQL request failed (graceful degradation)', [
				'code' => $code,
				'error' => $error
			] );
			return null;
		}

		$data = json_decode( $body, true );
		if ( is_array( $data ) && isset( $data['results']['bindings'][0]['depth']['value'] ) ) {
			return (int)$data['results']['bindings'][0]['depth']['value'];
		}

		return null;
	}
}
