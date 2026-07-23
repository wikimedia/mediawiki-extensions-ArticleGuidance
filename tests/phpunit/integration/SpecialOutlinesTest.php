<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\ArticleGuidance\Specials\SpecialOutlines;
use MediaWiki\Tests\Specials\SpecialPageTestBase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Specials\SpecialOutlines
 * @group Database
 */
class SpecialOutlinesTest extends SpecialPageTestBase {

	private const DEFAULT_GENERIC_OUTLINE = [
		'title' => OutlineService::DEFAULT_GENERIC_OUTLINE_TITLE,
		'generic' => true,
		'default' => true,
	];

	protected function setUp(): void {
		parent::setUp();
		$this->overrideConfigValue( 'ArticleGuidanceSuggestedArticleTypes', [] );
	}

	protected function newSpecialPage(): SpecialOutlines {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getOutlines' )->willReturn( [ self::DEFAULT_GENERIC_OUTLINE ] );
		$outlineService->method( 'getGenericOutline' )->willReturn( self::DEFAULT_GENERIC_OUTLINE );
		$outlineService->method( 'getDefaultGenericOutlineWikitext' )->willReturn( 'Default generic guidance' );

		$infoFetcher = $this->createMock( WikidataInfoFetcher::class );
		$infoFetcher->method( 'fetchEntitiesCached' )->willReturn( [ 'Q5' => [ 'label' => 'human' ] ] );
		$infoFetcher->method( 'fetchBasicEntities' )->willReturn( [ 'Q5' => [ 'label' => 'human' ] ] );

		$services = $this->getServiceContainer();
		return new SpecialOutlines(
			$outlineService,
			$services->getService( 'ArticleGuidanceWikidataUrls' ),
			$infoFetcher,
			$services->getTitleFactory(),
			$services->getMainConfig(),
			$services->getService( 'ArticleGuidanceOutlinePageNamer' )
		);
	}

	public function testListLinksDefaultGenericOutlineToItsPage(): void {
		[ $html ] = $this->executeSpecialPage();

		$this->assertStringContainsString( '(articleguidance-outlines-suggested-heading', $html );
		$this->assertStringContainsString( 'Special:Outlines/*', $html );
	}

	public function testDefaultGenericOutlinePage(): void {
		[ $html ] = $this->executeSpecialPage( '*' );

		$this->assertStringContainsString( '(articleguidance-outlines-generic-customize)', $html );
		$this->assertStringContainsString( 'preload=Special%3AOutlines%2F%2A', $html );
		$this->assertStringContainsString( 'Default generic guidance', $html );
	}

	public function testOutlineBuilder(): void {
		[ $html ] = $this->executeSpecialPage( 'Q5' );

		$this->assertStringContainsString( 'id="ext-articleguidance-outlinebuilder"', $html );
		$this->assertStringContainsString( '&quot;id&quot;:&quot;Q5&quot;', $html );
	}

	public function testInvalidTypes(): void {
		[ $html ] = $this->executeSpecialPage( 'not-a-type' );

		$this->assertStringContainsString( '(articleguidance-outlinebuilder-invalid-types)', $html );
	}
}
