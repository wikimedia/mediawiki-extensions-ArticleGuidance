<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Hooks\PreloadCleanupHandler;
use MediaWiki\Title\Title;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\PreloadCleanupHandler
 */
class PreloadCleanupHandlerTest extends MediaWikiUnitTestCase {

	private function getHandler(): PreloadCleanupHandler {
		return new PreloadCleanupHandler();
	}

	private function runCleanup( string $text ): string {
		$title = $this->createMock( Title::class );
		$this->getHandler()->onEditFormPreloadText( $text, $title );
		return $text;
	}

	public function testTagIsRemovedWhenNoCategory(): void {
		$input = "<article-guidance article-type=\"Q5\">\nSome content\n</article-guidance>\nArticle body.";
		$result = $this->runCleanup( $input );
		$this->assertStringNotContainsString( '<article-guidance', $result );
		$this->assertStringContainsString( 'Article body.', $result );
		$this->assertStringNotContainsString( '[[Category:', $result );
	}

	public function testCategoryIsAppendedWhenPresent(): void {
		$input = "<article-guidance article-type=\"Q5\" category=\"Actors\">\n</article-guidance>\nArticle body.";
		$result = $this->runCleanup( $input );
		$this->assertStringNotContainsString( '<article-guidance', $result );
		$this->assertStringContainsString( '[[Category:Actors]]', $result );
	}

	public function testEmptyCategoryProducesNoLink(): void {
		$input = "<article-guidance article-type=\"Q5\" category=\"\">\n</article-guidance>\nArticle body.";
		$result = $this->runCleanup( $input );
		$this->assertStringNotContainsString( '[[Category:', $result );
	}

	public function testCategoryWithInjectionCharsIsSanitized(): void {
		$input = "<article-guidance category=\"Act]]ors[[evil\">\n</article-guidance>";
		$result = $this->runCleanup( $input );
		$this->assertStringContainsString( '[[Category:Actorsevil]]', $result );
		$this->assertStringNotContainsString( ']][[', $result );
	}

	public function testTextWithoutTagIsUnchanged(): void {
		$input = "Just some plain article text ending with some whitepace.     ";
		$result = $this->runCleanup( $input );
		$this->assertSame( $input, $result );
	}
}
