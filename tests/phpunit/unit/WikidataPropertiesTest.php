<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\WikidataProperties;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\WikidataProperties
 */
class WikidataPropertiesTest extends MediaWikiUnitTestCase {

	public static function provideItemIds(): array {
		return [
			'smallest item' => [ 'Q1', true ],
			'typical item' => [ 'Q33999', true ],
			'largest item number' => [ 'Q2147483647', true ],
			'zero' => [ 'Q0', false ],
			'leading zero' => [ 'Q033999', false ],
			'number too large' => [ 'Q2147483648', false ],
			'eleven digits' => [ 'Q10000000000', false ],
			'lowercase q' => [ 'q42', false ],
			'no number' => [ 'Q', false ],
			'property' => [ 'P31', false ],
			'trailing newline' => [ "Q42\n", false ],
			'surrounding space' => [ ' Q42', false ],
			'empty' => [ '', false ],
		];
	}

	/**
	 * @dataProvider provideItemIds
	 */
	public function testIsItemId( string $id, bool $expected ): void {
		$this->assertSame( $expected, WikidataProperties::isItemId( $id ) );
	}
}
