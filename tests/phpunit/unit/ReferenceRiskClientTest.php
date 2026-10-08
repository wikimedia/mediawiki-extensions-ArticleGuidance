<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\ReferenceRiskClient;
use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Http\MWHttpRequest;
use MediaWiki\Status\Status;
use MediaWikiUnitTestCase;
use Psr\Log\NullLogger;
use Wikimedia\ObjectCache\HashBagOStuff;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\ReferenceRiskClient
 */
class ReferenceRiskClientTest extends MediaWikiUnitTestCase {

	/**
	 * @param bool $ok Whether the request succeeds
	 * @param string|null $content Response body
	 * @param array &$postData Receives the request body
	 * @param int &$requestCount Receives the number of requests
	 * @param WANObjectCache|null $cache
	 * @return ReferenceRiskClient
	 */
	private function getClient(
		bool $ok,
		?string $content,
		array &$postData = [],
		int &$requestCount = 0,
		?WANObjectCache $cache = null
	): ReferenceRiskClient {
		$status = $this->createMock( Status::class );
		$status->method( 'isOK' )->willReturn( $ok );
		$request = $this->createMock( MWHttpRequest::class );
		$request->method( 'execute' )->willReturn( $status );
		$request->method( 'getContent' )->willReturn( $content );
		$request->method( 'getStatus' )->willReturn( $ok ? 200 : 500 );

		$httpRequestFactory = $this->createMock( HttpRequestFactory::class );
		$httpRequestFactory->method( 'create' )->willReturnCallback(
			static function ( string $url, array $options ) use ( $request, &$postData, &$requestCount ) {
				$requestCount++;
				$postData = json_decode( $options['postData'], true );
				return $request;
			}
		);

		return new ReferenceRiskClient(
			$httpRequestFactory,
			$cache ?? WANObjectCache::newEmpty(),
			new NullLogger(),
			'https://example.org/v1/models/',
			null,
			'test-agent',
			'fr'
		);
	}

	public static function provideKnownDomains(): array {
		return [
			'risky' => [ true ],
			'not risky' => [ false ],
		];
	}

	/**
	 * @dataProvider provideKnownDomains
	 */
	public function testKnownDomain( bool $isRisky ): void {
		$postData = [];
		$client = $this->getClient( true, json_encode( [
			'domain' => 'lemonde.fr',
			'domain_metadata' => [
				'survival_ratio' => 0.92,
				'page_count' => 120,
				'editors_count' => 45,
				'ps_label_local' => null,
				'ps_label_enwiki' => 'Generally reliable',
				'is_risky' => $isRisky,
			],
		] ), $postData );

		$this->assertSame( $isRisky, $client->isRisky( 'lemonde.fr' ) );
		$this->assertSame( [ 'domain' => 'lemonde.fr', 'lang' => 'fr' ], $postData );
	}

	public function testUnknownDomain(): void {
		$client = $this->getClient( true, json_encode( [
			'domain' => 'unknown.example',
			'domain_metadata' => null,
		] ) );

		$this->assertFalse( $client->isRisky( 'unknown.example' ) );
	}

	public function testRequestFailure(): void {
		$client = $this->getClient( false, null );

		$this->assertFalse( $client->isRisky( 'lemonde.fr' ) );
	}

	public function testUnexpectedResponse(): void {
		$client = $this->getClient( true, '{"error":"oops"}' );

		$this->assertFalse( $client->isRisky( 'lemonde.fr' ) );
	}

	public function testMissingRiskFlag(): void {
		$client = $this->getClient( true, json_encode( [
			'domain' => 'lemonde.fr',
			'domain_metadata' => [ 'survival_ratio' => 0.92 ],
		] ) );

		$this->assertFalse( $client->isRisky( 'lemonde.fr' ) );
	}

	public function testRequestFailureIsCachedBriefly(): void {
		$postData = [];
		$requestCount = 0;
		$client = $this->getClient(
			false,
			null,
			$postData,
			$requestCount,
			new WANObjectCache( [ 'cache' => new HashBagOStuff() ] )
		);

		$client->isRisky( 'lemonde.fr' );
		$client->isRisky( 'lemonde.fr' );
		$this->assertSame( 1, $requestCount );
	}
}
