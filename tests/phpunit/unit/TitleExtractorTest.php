<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor
 */
class TitleExtractorTest extends MediaWikiUnitTestCase {

	public static function provideExtractPageTitle(): iterable {
		yield 'pretty URL' => [
			'https://en.wikipedia.org/wiki/Foo',
			'Foo',
		];
		yield 'pretty URL with encoded spaces' => [
			'https://en.wikipedia.org/wiki/Foo%20Bar',
			'Foo Bar',
		];
		yield 'pretty URL with underscores' => [
			'https://en.wikipedia.org/wiki/Foo_Bar',
			'Foo_Bar',
		];
		yield 'pretty URL with namespace prefix' => [
			'https://en.wikipedia.org/wiki/Talk:Foo',
			'Talk:Foo',
		];
		yield 'script URL' => [
			'https://en.wikipedia.org/w/index.php?title=Foo',
			'Foo',
		];
		yield 'script URL with extra params' => [
			'https://en.wikipedia.org/w/index.php?action=edit&title=Foo',
			'Foo',
		];
		yield 'non-MediaWiki URL' => [
			'https://example.com/some/path',
			null,
		];
		yield 'URL with no path' => [
			'https://example.com',
			null,
		];
		yield 'script URL with no title param' => [
			'https://en.wikipedia.org/w/index.php?action=edit',
			null,
		];
	}

	/**
	 * @dataProvider provideExtractPageTitle
	 */
	public function testExtractPageTitle( string $url, ?string $expected ): void {
		$extractor = new TitleExtractor();
		$this->assertSame( $expected, $extractor->extractPageTitle( $url ) );
	}

}
