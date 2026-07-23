<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\OutlinePageNamer;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\OutlinePageNamer
 */
class OutlinePageNamerTest extends MediaWikiUnitTestCase {

	public function testNamesForTypeTryLabelThenLabelWithQIdThenQId(): void {
		$this->assertSame(
			[ 'Painting', 'Painting (Q3305213)', 'Q3305213' ],
			OutlinePageNamer::getNamesForType( 'Q3305213', 'Painting' )
		);
	}

	public function testNamesForTypeWithoutLabelUseQId(): void {
		$this->assertSame(
			[ 'Q3305213' ],
			OutlinePageNamer::getNamesForType( 'Q3305213', '' )
		);
	}
}
