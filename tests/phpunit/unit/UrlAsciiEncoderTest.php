<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\UrlAsciiEncoder;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\UrlAsciiEncoder
 */
class UrlAsciiEncoderTest extends MediaWikiUnitTestCase {

	/**
	 * @dataProvider provideNormalizeUrl
	 */
	public function testNormalizeUrl( string $input, string $expected ) {
		$this->assertSame( $expected, ( new UrlAsciiEncoder() )->encode( $input ) );
	}

	public static function provideNormalizeUrl(): array {
		return [
			'plain ASCII URL is unchanged' => [
				'https://example.com/article',
				'https://example.com/article',
			],
			'Latin IDN hostname is converted to punycode' => [
				'https://bücher.example/page',
				'https://xn--bcher-kva.example/page',
			],
			'Greek IDN hostname (multi-label) is converted to punycode' => [
				'https://ουτοπία.δπθ.gr/',
				'https://xn--kxae4bafwg.xn--pxaix.gr/',
			],
			'Bengali IDN hostname is converted to punycode' => [
				'https://উইকিপিডিয়া.বাংলা/',
				'https://xn--b5bd1b9b3b5azgqaebb.xn--54b7fta0cc/',
			],
			'non-ASCII path is percent-encoded' => [
				'https://ja.wikipedia.org/wiki/東京',
				'https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC',
			],
			'IDN host combined with non-ASCII path' => [
				'https://bücher.example/wiki/東京',
				'https://xn--bcher-kva.example/wiki/%E6%9D%B1%E4%BA%AC',
			],
			'non-ASCII query string is percent-encoded' => [
				'https://example.com/search?q=東京',
				'https://example.com/search?q=%E6%9D%B1%E4%BA%AC',
			],
			'already percent-encoded path is not double-encoded' => [
				'https://example.com/wiki/%E6%9D%B1%E4%BA%AC',
				'https://example.com/wiki/%E6%9D%B1%E4%BA%AC',
			],
		];
	}
}
