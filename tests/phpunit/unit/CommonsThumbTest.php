<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\CommonsThumb;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\CommonsThumb
 */
class CommonsThumbTest extends MediaWikiUnitTestCase {

	/**
	 * @dataProvider provideGetUrl
	 */
	public function testGetUrl( string $filename, string $expected ): void {
		$this->assertSame( $expected, ( new CommonsThumb() )->getUrl( $filename ) );
	}

	public static function provideGetUrl(): array {
		return [
			'raster image, spaces become underscores' => [
				'Albert Einstein Head.jpg',
				'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Albert_Einstein_Head.jpg/' .
					'60px-Albert_Einstein_Head.jpg',
			],
			'SVG image gets a .png suffix' => [
				'Lawrencium.svg',
				'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Lawrencium.svg/60px-Lawrencium.svg.png',
			],
			'SVG extension is matched case-insensitively' => [
				'Lawrencium.SVG',
				'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Lawrencium.SVG/60px-Lawrencium.SVG.png',
			],
		];
	}
}
