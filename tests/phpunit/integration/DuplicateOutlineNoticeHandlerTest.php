<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Hooks\DuplicateOutlineNoticeHandler;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Output\OutputPage;
use MediaWiki\Parser\ParserOutput;
use MediaWiki\Request\FauxRequest;
use MediaWiki\Title\Title;
use MediaWikiIntegrationTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\DuplicateOutlineNoticeHandler
 * @group Database
 */
class DuplicateOutlineNoticeHandlerTest extends MediaWikiIntegrationTestCase {

	private function getHandler( OutlineService $outlineService ): DuplicateOutlineNoticeHandler {
		return new DuplicateOutlineNoticeHandler(
			$outlineService,
			$this->getServiceContainer()->getLinkRenderer(),
			new WikidataUrls( [
				'api' => 'https://www.wikidata.org/w/api.php',
				'view' => 'https://www.wikidata.org/wiki/$1',
				'sparql' => 'https://query.wikidata.org/sparql',
			] )
		);
	}

	private function getOutputPage( string $action = 'view' ): OutputPage {
		$context = new RequestContext();
		$context->setRequest( new FauxRequest( [ 'action' => $action ] ) );
		$context->setTitle( $this->getExistingTestPage( 'Outline' )->getTitle() );
		$context->setLanguage( 'qqx' );
		return $context->getOutput();
	}

	private function getParserOutput( ?array $articleTypes ): ParserOutput {
		$parserOutput = new ParserOutput();
		if ( $articleTypes !== null ) {
			$parserOutput->setPageProperty( 'articleguidance-data', json_encode( [
				'articleType' => $articleTypes[0]['id'],
				'articleTypes' => $articleTypes,
			] ) );
		}
		return $parserOutput;
	}

	public function testIgnoresPagesThatAreNotOutlines(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->expects( $this->never() )->method( 'getDuplicates' );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput( $outputPage, $this->getParserOutput( null ) );

		$this->assertSame( '', $outputPage->getHTML() );
	}

	public function testIgnoresOtherActions(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->expects( $this->never() )->method( 'getDuplicates' );
		$outputPage = $this->getOutputPage( 'history' );

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q5' ] ] )
		);

		$this->assertSame( '', $outputPage->getHTML() );
	}

	public function testNoDuplicates(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [] );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q5' ] ] )
		);

		$this->assertSame( '', $outputPage->getHTML() );
		$this->assertNotContains( 'mediawiki.codex.messagebox.styles', $outputPage->getModuleStyles() );
	}

	public function testActiveOutline(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [
			'Q3314483' => [ 'owner' => null, 'others' => [ Title::makeTitle( NS_PROJECT, 'Citrus' ) ] ],
		] );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q3314483', 'itemLabel' => 'fruit' ] ] )
		);

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( 'cdx-message--notice', $html );
		$this->assertStringContainsString(
			'(articleguidance-duplicate-active-lead: (articleguidance-duplicate-item: fruit',
			$html
		);
		$this->assertStringContainsString( 'https://www.wikidata.org/wiki/Q3314483', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-active-detail-single:', $html );
		$this->assertStringContainsString( 'Citrus', $html );
		$this->assertContains( 'mediawiki.codex.messagebox.styles', $outputPage->getModuleStyles() );
	}

	public function testActiveOutlineWithSeveralDuplicatesListsThem(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [
			'Q5' => [ 'owner' => null, 'others' => [
				Title::makeTitle( NS_PROJECT, 'People' ),
				Title::makeTitle( NS_PROJECT, 'Human' ),
			] ],
		] );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q5' ] ] )
		);

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( '(articleguidance-duplicate-active-detail-multiple)', $html );
		$this->assertSame( 2, substr_count( $html, '<li>' ) );
		// A blob without itemLabel shows only the linked QID
		$this->assertStringNotContainsString( 'articleguidance-duplicate-item', $html );
	}

	public function testInactiveOutline(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [
			'Q3314483' => [ 'owner' => Title::makeTitle( NS_PROJECT, 'Fruit' ), 'others' => [] ],
		] );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q3314483', 'itemLabel' => 'fruit' ] ] )
		);

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( 'cdx-message--warning', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-inactive-lead)', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-inactive-detail:', $html );
		$this->assertStringContainsString( 'Fruit', $html );
		$this->assertStringNotContainsString( 'cdx-message--notice', $html );
	}

	public function testActiveGenericOutline(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->expects( $this->once() )->method( 'getDuplicates' )
			->with( $this->anything(), [ OutlineService::GENERIC_ARTICLE_TYPE ] )
			->willReturn( [
				OutlineService::GENERIC_ARTICLE_TYPE => [
					'owner' => null,
					'others' => [ Title::makeTitle( NS_PROJECT, 'Other generic' ) ],
				],
			] );
		$outputPage = $this->getOutputPage();
		$parserOutput = new ParserOutput();
		$parserOutput->setPageProperty( 'articleguidance-data', json_encode( [
			'articleTypes' => [],
			'generic' => true,
		] ) );

		$this->getHandler( $outlineService )->onOutputPageParserOutput( $outputPage, $parserOutput );

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( 'cdx-message--notice', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-generic-active-lead)', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-generic-active-detail-single:', $html );
		$this->assertStringContainsString( 'Other generic', $html );
		// The sentinel is not a Wikidata item
		$this->assertStringNotContainsString( 'wikidata.org', $html );
	}

	public function testInactiveGenericOutline(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [
			OutlineService::GENERIC_ARTICLE_TYPE => [
				'owner' => Title::makeTitle( NS_PROJECT, 'Generic' ),
				'others' => [],
			],
		] );
		$outputPage = $this->getOutputPage();
		$parserOutput = new ParserOutput();
		$parserOutput->setPageProperty( 'articleguidance-data', json_encode( [
			'articleTypes' => [],
			'generic' => true,
		] ) );

		$this->getHandler( $outlineService )->onOutputPageParserOutput( $outputPage, $parserOutput );

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( 'cdx-message--warning', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-inactive-lead)', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-generic-inactive-detail:', $html );
		$this->assertStringContainsString( 'Generic', $html );
		$this->assertStringNotContainsString( 'wikidata.org', $html );
	}

	public function testPartiallyShadowedOutlineShowsWarningThenNotice(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDuplicates' )->willReturn( [
			'Q1' => [ 'owner' => null, 'others' => [ Title::makeTitle( NS_PROJECT, 'Other' ) ] ],
			'Q2' => [ 'owner' => Title::makeTitle( NS_PROJECT, 'Company' ), 'others' => [] ],
		] );
		$outputPage = $this->getOutputPage();

		$this->getHandler( $outlineService )->onOutputPageParserOutput(
			$outputPage,
			$this->getParserOutput( [ [ 'id' => 'Q1' ], [ 'id' => 'Q2' ], [ 'id' => 'Q3' ] ] )
		);

		$html = $outputPage->getHTML();
		$this->assertStringContainsString( '(articleguidance-duplicate-partial-lead)', $html );
		$this->assertStringContainsString( '(articleguidance-duplicate-partial-detail:', $html );
		$this->assertLessThan(
			strpos( $html, 'cdx-message--notice' ),
			strpos( $html, 'cdx-message--warning' )
		);
	}
}
