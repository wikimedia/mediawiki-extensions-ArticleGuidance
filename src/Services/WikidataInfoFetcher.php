<?php

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Language\Language;
use Psr\Log\LoggerInterface;
use WANObjectCache;

/**
 * Service for fetching Wikidata entity information including labels, descriptions,
 * images, and hierarchy depth via concurrent API calls
 */
class WikidataInfoFetcher {

	private HttpRequestFactory $httpRequestFactory;
	private Language $contentLanguage;
	private LoggerInterface $logger;
	private WANObjectCache $cache;

	public function __construct(
		HttpRequestFactory $httpRequestFactory,
		Language $contentLanguage,
		LoggerInterface $logger,
		WANObjectCache $cache
	) {
		$this->httpRequestFactory = $httpRequestFactory;
		$this->contentLanguage = $contentLanguage;
		$this->logger = $logger;
		$this->cache = $cache;
	}

	/**
	 * Convert a Wikimedia Commons image filename to a thumbnail URL
	 *
	 * @param string $filename Image filename from Wikidata
	 * @param int $width Thumbnail width (default 200px)
	 * @return string Thumbnail URL
	 */
	private function getCommonsImageUrl( string $filename, int $width = 200 ): string {
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
			$width,
			rawurlencode( $filename )
		);
	}

	/**
	 * Fetch a single Wikidata entity with caching, including hierarchy depth
	 *
	 * Fetches label, description, image, and hierarchy depth concurrently
	 * using MultiHttpClient for optimal performance.
	 *
	 * Hierarchy depth is calculated using both P279 (subclass of) for regular items
	 * and P171 (parent taxon) for biological taxons. The larger depth value is used
	 * to ensure accurate specificity ranking for both types of entities.
	 *
	 * @param string $wikidataId Wikidata Q ID
	 * @param string $languageCode Language code
	 * @return array|null Array with 'label', 'description', 'image', and 'hierarchyDepth', or null
	 */
	public function fetchEntityCached( string $wikidataId, string $languageCode ): ?array {
		// Cache key version - increment to invalidate old cache entries
		$cacheKey = $this->cache->makeKey( 'articleguidance', 'wikidata', $wikidataId, $languageCode, 'v3' );
		$method = __METHOD__;

		return $this->cache->getWithSetCallback(
			$cacheKey,
			WANObjectCache::TTL_DAY,
			function ( $oldValue, &$ttl, &$setOpts ) use ( $wikidataId, $languageCode, $method ) {
				// Create MultiHttpClient for concurrent requests
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

				// Request 2: SPARQL for hierarchy depth using both P279 and P171
				// P279 = subclass of (for regular items)
				// P171 = parent taxon (for biological taxons)
				// We use MAX to get the larger depth from either hierarchy
				$sparqlQuery = "SELECT (MAX(?depth) as ?maxDepth) WHERE {
  {
    SELECT (COUNT(?intermediate) as ?depth) WHERE {
      wd:{$wikidataId} wdt:P279* ?intermediate .
    }
  } UNION {
    SELECT (COUNT(?intermediate) as ?depth) WHERE {
      wd:{$wikidataId} wdt:P171* ?intermediate .
    }
  }
}";
				$sparqlReq = [
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

				// Execute both requests concurrently
				$responses = $multiClient->runMulti( [ $wbgetentitiesReq, $sparqlReq ], [], $method );

				// Process REST API response (label/description/image)
				$entityData = $this->processWbgetentitiesResponse(
					$responses[0]['response'],
					$wikidataId,
					$languageCode
				);

				if ( !$entityData ) {
					$ttl = WANObjectCache::TTL_MINUTE * 5;
					return null;
				}

				// Process SPARQL response (hierarchy depth) - graceful degradation
				$hierarchyDepth = $this->processSparqlResponse( $responses[1]['response'] );
				$entityData['hierarchyDepth'] = $hierarchyDepth;

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

		try {
			$data = json_decode( $body, true );
			if ( !isset( $data['entities'][$wikidataId] ) ) {
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
			if ( isset( $entity['claims']['P18'][0]['mainsnak']['datavalue']['value'] ) ) {
				$imageName = $entity['claims']['P18'][0]['mainsnak']['datavalue']['value'];
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
		} catch ( \Exception $e ) {
			$this->logger->warning( 'Failed to parse wbgetentities response: ' . $e->getMessage() );
			return null;
		}
	}

	/**
	 * Process SPARQL response for hierarchy depth with graceful degradation
	 *
	 * Handles the MAX depth calculation from both P279 (subclass of) and P171 (parent taxon)
	 * chains. Regular items will have meaningful P279 depth, taxons will have meaningful P171
	 * depth, and the MAX ensures we get the correct specificity measure for both.
	 *
	 * @param array $response Response array from MultiHttpClient
	 * @return int|null Hierarchy depth (max of P279 and P171 ancestors), or null on failure
	 */
	private function processSparqlResponse( array $response ): ?int {
		[ $code, $reason, $headers, $body, $error ] = $response;

		if ( $code !== 200 ) {
			$this->logger->warning( 'SPARQL request failed (graceful degradation)', [
				'code' => $code,
				'error' => $error
			] );
			// Service remains functional without depth
			return null;
		}

		try {
			$data = json_decode( $body, true );
			if ( isset( $data['results']['bindings'][0]['maxDepth']['value'] ) ) {
				return (int)$data['results']['bindings'][0]['maxDepth']['value'];
			}
		} catch ( \Exception $e ) {
			$this->logger->warning( 'Failed to parse SPARQL response: ' . $e->getMessage() );
		}

		// Graceful degradation
		return null;
	}
}
