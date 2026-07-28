<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Language\Language;
use MediaWikiIntegrationTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer
 */
class ArticleGuidanceRendererTest extends MediaWikiIntegrationTestCase {

	private function getRenderer(): ArticleGuidanceRenderer {
		return new ArticleGuidanceRenderer( new WikidataUrls( [
			'api' => 'https://www.wikidata.org/w/api.php',
			'view' => 'https://www.wikidata.org/wiki/$1',
			'sparql' => 'https://query.wikidata.org/sparql',
		] ) );
	}

	private function getLanguage(): Language {
		return $this->getServiceContainer()->getLanguageFactory()->getLanguage( 'qqx' );
	}

	/**
	 * Render with the given article types and no other content.
	 *
	 * @param array $articleTypes
	 * @param string|null $articleType Raw attribute value
	 * @return string HTML
	 */
	private function render( array $articleTypes, ?string $articleType ): string {
		return $this->getRenderer()->render(
			$this->getLanguage(),
			$articleTypes,
			$articleType,
			[],
			[],
			null,
			null,
			null
		);
	}

	public function testRendersOneRowPerArticleType(): void {
		$html = $this->render(
			[
				[
					'id' => 'Q4830453',
					'label' => 'business',
					'description' => 'organization undertaking commercial activity',
					'matchVia' => null,
				],
				[
					'id' => 'Q783794',
					'label' => 'company',
					'description' => 'association of people',
					'matchVia' => 'P106',
				],
			],
			'Q4830453 Q783794'
		);

		$this->assertSame( 2, substr_count( $html, 'ext-articleguidance-type-item' ) );
		// Each row links its item and shows its own label and description
		$this->assertStringContainsString( 'https://www.wikidata.org/wiki/Q4830453', $html );
		$this->assertStringContainsString( 'https://www.wikidata.org/wiki/Q783794', $html );
		$this->assertStringContainsString( 'business', $html );
		$this->assertStringContainsString( 'company', $html );
		$this->assertStringContainsString( 'organization undertaking commercial activity', $html );
		$this->assertStringContainsString( 'association of people', $html );
		// Match-via tooltips are per entry
		$this->assertStringContainsString( 'match-via: default', $html );
		$this->assertStringContainsString( 'match-via: P106', $html );
	}

	public function testRendersBareLinksWithoutEntityData(): void {
		// Preview: entity data is not fetched, so labels/descriptions are null
		$html = $this->render(
			[
				[ 'id' => 'Q4830453', 'label' => null, 'description' => null, 'matchVia' => null ],
				[ 'id' => 'Q783794', 'label' => null, 'description' => null, 'matchVia' => null ],
			],
			'Q4830453 Q783794'
		);

		$this->assertSame( 2, substr_count( $html, 'ext-articleguidance-type-item' ) );
		$this->assertStringContainsString( 'https://www.wikidata.org/wiki/Q783794', $html );
		$this->assertStringNotContainsString( 'parentheses', $html );
		$this->assertStringNotContainsString( 'ext-articleguidance-type-description', $html );
	}

	public function testRendersErrorForInvalidArticleType(): void {
		$html = $this->render( [], 'Q123 bogus' );

		$this->assertStringContainsString( 'ext-articleguidance-invalid', $html );
		$this->assertStringContainsString( 'articleguidance-invalid-article-type', $html );
		$this->assertStringNotContainsString( 'ext-articleguidance-type-item', $html );
	}
}
