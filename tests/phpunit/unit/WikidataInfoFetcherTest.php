<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\CommonsThumb;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Language\Language;
use MediaWiki\Language\LanguageFactory;
use MediaWikiUnitTestCase;
use Psr\Log\NullLogger;
use Wikimedia\Http\MultiHttpClient;
use Wikimedia\ObjectCache\HashBagOStuff;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher
 */
class WikidataInfoFetcherTest extends MediaWikiUnitTestCase {

	private const WBGETENTITIES_BODY = [
		'entities' => [
			'Q515' => [
				'labels' => [ 'en' => [ 'language' => 'en', 'value' => 'city' ] ],
				'descriptions' => [ 'en' => [ 'value' => 'large human settlement' ] ],
			],
			'Q140' => [
				'labels' => [ 'en' => [ 'language' => 'en', 'value' => 'lion' ] ],
			],
		],
	];

	private const INFERENCE_SPARQL_BODY = [
		'results' => [ 'bindings' => [
			[
				'item' => [ 'value' => 'http://www.wikidata.org/entity/Q515' ],
				'inferredMatchVia' => [ 'value' => '' ],
				'p279depth' => [ 'value' => '66' ],
				'p171depth' => [ 'value' => '1' ],
			],
			[
				'item' => [ 'value' => 'http://www.wikidata.org/entity/Q140' ],
				'inferredMatchVia' => [ 'value' => 'P171' ],
				'p279depth' => [ 'value' => '3' ],
				'p171depth' => [ 'value' => '85' ],
			],
		] ],
	];

	/**
	 * @param array $responses Response by request type ('wbgetentities' or 'sparql'),
	 *   each as [ HTTP code, decoded body ]
	 * @param array &$batches Receives the requests of each runMulti() call
	 * @return WikidataInfoFetcher
	 */
	private function getFetcher( array $responses, array &$batches = [] ): WikidataInfoFetcher {
		$multiClient = $this->createMock( MultiHttpClient::class );
		$multiClient->method( 'runMulti' )->willReturnCallback(
			static function ( array $reqs ) use ( $responses, &$batches ) {
				$batches[] = $reqs;
				foreach ( $reqs as &$req ) {
					$type = str_contains( $req['url'], 'wbgetentities' ) ? 'wbgetentities' : 'sparql';
					[ $code, $body ] = $responses[$type];
					$req['response'] = [ $code, '', [], json_encode( $body ), '' ];
				}
				return $reqs;
			}
		);
		$httpRequestFactory = $this->createMock( HttpRequestFactory::class );
		$httpRequestFactory->method( 'createMultiClient' )->willReturn( $multiClient );

		$language = $this->createMock( Language::class );
		$language->method( 'ucfirst' )->willReturnCallback( 'ucfirst' );
		$languageFactory = $this->createMock( LanguageFactory::class );
		$languageFactory->method( 'getLanguage' )->willReturn( $language );

		return new WikidataInfoFetcher(
			$httpRequestFactory,
			$languageFactory,
			new NullLogger(),
			new WANObjectCache( [ 'cache' => new HashBagOStuff() ] ),
			[
				[ 'superclass' => 'Q12737077', 'matchVia' => 'P106' ],
				[ 'superclass' => 'Q16521', 'matchVia' => 'P171', 'exclude' => 'Q5' ],
			],
			'test-agent',
			new WikidataUrls( [
				'api' => 'https://www.wikidata.org/w/api.php',
				'view' => 'https://www.wikidata.org/wiki/$1',
				'sparql' => 'https://query.wikidata.org/sparql',
			] ),
			new CommonsThumb()
		);
	}

	/**
	 * @param array $req Request sent to runMulti()
	 * @return array Query parameters of the request URL
	 */
	private static function getQueryParams( array $req ): array {
		parse_str( parse_url( $req['url'], PHP_URL_QUERY ), $params );
		return $params;
	}

	public function testFetchesAllIdsInOneBatch(): void {
		$batches = [];
		$fetcher = $this->getFetcher( [
			'wbgetentities' => [ 200, self::WBGETENTITIES_BODY ],
			'sparql' => [ 200, self::INFERENCE_SPARQL_BODY ],
		], $batches );

		$entities = $fetcher->fetchEntitiesCached( [ 'Q515', 'Q140' ], 'en' );

		$this->assertCount( 1, $batches );
		$this->assertSame( 'Q515|Q140', self::getQueryParams( $batches[0][0] )['ids'] );
		$this->assertStringContainsString(
			'VALUES ?item { wd:Q515 wd:Q140 }',
			self::getQueryParams( $batches[0][1] )['query']
		);
		$this->assertSame( [
			'Q515' => [
				'label' => 'City',
				'description' => 'large human settlement',
				'image' => null,
				'matchVia' => null,
				'hierarchyDepth' => 66,
			],
			'Q140' => [
				'label' => 'Lion',
				'description' => null,
				'image' => null,
				'matchVia' => 'P171',
				'hierarchyDepth' => 85,
			],
		], $entities );
	}

	public function testFetchesOnlyIdsMissingFromCache(): void {
		$batches = [];
		$fetcher = $this->getFetcher( [
			'wbgetentities' => [ 200, self::WBGETENTITIES_BODY ],
			'sparql' => [ 200, self::INFERENCE_SPARQL_BODY ],
		], $batches );

		$fetcher->fetchEntitiesCached( [ 'Q515' ], 'en' );
		$entities = $fetcher->fetchEntitiesCached( [ 'Q515', 'Q140' ], 'en' );

		$this->assertSame(
			[ 'Q515', 'Q140' ],
			array_map( static fn ( array $batch ) => self::getQueryParams( $batch[0] )['ids'], $batches )
		);
		$this->assertSame( [ 'Q515', 'Q140' ], array_keys( $entities ) );
		$this->assertSame( 'City', $entities['Q515']['label'] );
	}

	public function testExplicitMatchViaCountsDepthAlongItsChain(): void {
		$batches = [];
		$fetcher = $this->getFetcher( [
			'wbgetentities' => [ 200, self::WBGETENTITIES_BODY ],
			'sparql' => [ 200, [ 'results' => [ 'bindings' => [ [
				'item' => [ 'value' => 'http://www.wikidata.org/entity/Q140' ],
				'depth' => [ 'value' => '85' ],
			] ] ] ] ],
		], $batches );

		$entities = $fetcher->fetchEntitiesCached( [ 'Q140' ], 'en', 'P171' );

		$this->assertStringContainsString(
			'?item wdt:P171* ?intermediate',
			self::getQueryParams( $batches[0][1] )['query']
		);
		$this->assertSame( 'P171', $entities['Q140']['matchVia'] );
		$this->assertSame( 85, $entities['Q140']['hierarchyDepth'] );
	}

	public function testSparqlFailureKeepsEntityData(): void {
		$fetcher = $this->getFetcher( [
			'wbgetentities' => [ 200, self::WBGETENTITIES_BODY ],
			'sparql' => [ 500, null ],
		] );

		$entities = $fetcher->fetchEntitiesCached( [ 'Q515', 'Q140' ], 'en' );

		$this->assertSame( 'City', $entities['Q515']['label'] );
		$this->assertNull( $entities['Q515']['hierarchyDepth'] );
		$this->assertSame( 'Lion', $entities['Q140']['label'] );
		$this->assertNull( $entities['Q140']['hierarchyDepth'] );
	}

	public function testWbgetentitiesFailureGivesNullForEachId(): void {
		$fetcher = $this->getFetcher( [
			'wbgetentities' => [ 500, null ],
			'sparql' => [ 200, self::INFERENCE_SPARQL_BODY ],
		] );

		$this->assertSame(
			[ 'Q515' => null, 'Q140' => null ],
			$fetcher->fetchEntitiesCached( [ 'Q515', 'Q140' ], 'en' )
		);
	}
}
