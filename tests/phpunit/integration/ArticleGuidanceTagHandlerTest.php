<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Config\HashConfig;
use MediaWiki\Extension\ArticleGuidance\Hooks\ArticleGuidanceTagHandler;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Parser\Parser;
use MediaWiki\Parser\ParserOptions;
use MediaWiki\Parser\ParserOutput;
use MediaWiki\Parser\PPFrame;
use MediaWiki\Title\Title;
use MediaWikiIntegrationTestCase;

/**
 * The tag is the only writer of the articleguidance-data page property, so
 * these tests pin what an outline page stores. OutlineServiceTest covers the
 * read side of the same blob.
 *
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\ArticleGuidanceTagHandler
 */
class ArticleGuidanceTagHandlerTest extends MediaWikiIntegrationTestCase {

	private ParserOutput $parserOutput;

	/**
	 * Build a parser whose output this test can inspect.
	 *
	 * @param bool $isPreview Whether the parse is a preview
	 * @return Parser
	 */
	private function getParser( bool $isPreview = false ): Parser {
		$this->parserOutput = new ParserOutput();
		$options = ParserOptions::newFromAnon();
		$options->setIsPreview( $isPreview );
		$language = $this->getServiceContainer()->getLanguageFactory()->getLanguage( 'qqx' );

		$parser = $this->createMock( Parser::class );
		$parser->method( 'getOutput' )->willReturn( $this->parserOutput );
		$parser->method( 'getOptions' )->willReturn( $options );
		$parser->method( 'getTitle' )->willReturn(
			Title::newFromText( 'Wikipedia:Article guidance/General guidance' )
		);
		$parser->method( 'getContentLanguage' )->willReturn( $language );
		$parser->method( 'getTargetLanguage' )->willReturn( $language );
		// Good enough for these assertions: the tag stores parsed HTML, and
		// what the parser makes of the wikitext is not what is under test.
		$parser->method( 'recursiveTagParseFully' )
			->willReturnCallback( static fn ( $text ) => '<p>' . trim( $text ) . '</p>' );
		return $parser;
	}

	/**
	 * @param array|null $entityData What the Wikidata fetcher returns per ID
	 * @return ArticleGuidanceTagHandler
	 */
	private function getHandler( ?array $entityData = null ): ArticleGuidanceTagHandler {
		$fetcher = $this->createMock( WikidataInfoFetcher::class );
		$fetcher->method( 'fetchEntityCached' )->willReturn( $entityData );

		return new ArticleGuidanceTagHandler(
			$fetcher,
			new ArticleGuidanceRenderer( new WikidataUrls( [
				'api' => 'https://www.wikidata.org/w/api.php',
				'view' => 'https://www.wikidata.org/wiki/$1',
				'sparql' => 'https://query.wikidata.org/sparql',
			] ) ),
			new TagContentExtractorService(),
			new HashConfig( [ 'ArticleGuidanceCrossWikiThreshold' => 5 ] )
		);
	}

	/**
	 * Render a tag and return its HTML. The stored blob is read separately
	 * through getStoredData().
	 *
	 * @param array $attributes Tag attributes
	 * @param string|null $content Tag content
	 * @param bool $isPreview Whether the parse is a preview
	 * @param array|null $entityData What the Wikidata fetcher returns
	 * @return string
	 */
	private function renderTag(
		array $attributes,
		?string $content = null,
		bool $isPreview = false,
		?array $entityData = null
	): string {
		$parser = $this->getParser( $isPreview );
		return $this->getHandler( $entityData )->renderArticleGuidance(
			$content,
			$attributes,
			$parser,
			$this->createMock( PPFrame::class )
		);
	}

	/**
	 * @return array|null The decoded page property, or null if none was stored
	 */
	private function getStoredData(): ?array {
		$json = $this->parserOutput->getPageProperty( 'articleguidance-data' );
		return $json === null ? null : json_decode( $json, true );
	}

	/**
	 * The generic outline stores a blob with no article types at all, and says
	 * so explicitly, so the reader can tell it apart from an outline whose
	 * types failed to parse (T435605).
	 */
	public function testGenericOutlineStoresNoArticleTypes(): void {
		$this->renderTag( [ 'article-type' => '*' ] );

		$data = $this->getStoredData();
		$this->assertNotNull( $data );
		$this->assertTrue( $data['generic'] );
		$this->assertSame( [], $data['articleTypes'] );
		// The singular rollback key names a Q ID, and there is none to name
		$this->assertArrayNotHasKey( 'articleType', $data );
		$this->assertSame( 'General guidance', $data['label'] );
	}

	/**
	 * The interface never names the generic outline, so a custom label is not
	 * stored, and the tag box does not show the custom label note.
	 */
	public function testGenericOutlineIgnoresCustomLabel(): void {
		$html = $this->renderTag( [ 'article-type' => '*', 'label' => 'Anything' ] );

		$data = $this->getStoredData();
		$this->assertNotNull( $data );
		$this->assertSame( 'General guidance', $data['label'] );
		$this->assertStringNotContainsString( 'ext-articleguidance-custom-label-note', $html );
	}

	/**
	 * A generic outline can list source domains like any other outline. This
	 * is the authoring end of the chain that SourceValidatorTest finishes.
	 */
	public function testGenericOutlineStoresSourceLists(): void {
		$this->renderTag( [ 'article-type' => '*' ], <<<'WIKITEXT'
			<recommended-sources>
			<info>News organisations with editorial oversight</info>
			<source>reuters.com</source>
			</recommended-sources>
			<discouraged-sources>
			<source>facebook.com</source>
			</discouraged-sources>
			WIKITEXT );

		$data = $this->getStoredData();
		$this->assertNotNull( $data );
		$this->assertSame( [ 'reuters.com' ], $data['recommendedSources']['urls'] );
		$this->assertSame( [ 'facebook.com' ], $data['discouragedSources']['urls'] );
	}

	/**
	 * Notability risk and instructions reach the blob for a generic outline
	 * too. Before T435605 nothing was stored without a Q ID.
	 */
	public function testGenericOutlineStoresInstructionsAndNotabilityRisk(): void {
		$this->renderTag(
			[ 'article-type' => '*', 'notability-risk' => 'sources' ],
			'<instructions>Cite your sources.</instructions>'
		);

		$data = $this->getStoredData();
		$this->assertNotNull( $data );
		$this->assertSame( [ 'sources' ], $data['notabilityRisk'] );
		$this->assertStringContainsString( 'Cite your sources.', $data['instructions'] );
	}

	/**
	 * The sentinel must stand alone. Mixing it with Q IDs invalidates the whole
	 * attribute rather than silently dropping one of the two.
	 */
	public function testSentinelMixedWithQIdsIsInvalid(): void {
		$html = $this->renderTag( [ 'article-type' => '* Q5' ] );

		$this->assertNull( $this->getStoredData() );
		$this->assertStringContainsString( 'ext-articleguidance-invalid', $html );
		$this->assertStringContainsString( 'articleguidance-invalid-article-type', $html );
	}

	/**
	 * A generic outline is not an invalid one, even though both end up with an
	 * empty article type list.
	 */
	public function testGenericOutlineRendersItsNoteAndNoError(): void {
		$html = $this->renderTag( [ 'article-type' => '*' ] );

		$this->assertStringContainsString( 'ext-articleguidance-generic-note', $html );
		$this->assertStringNotContainsString( 'ext-articleguidance-invalid', $html );
		$this->assertStringNotContainsString( 'articleguidance-invalid-article-type', $html );
	}

	/**
	 * Previews render but never store, for a generic outline as for any other.
	 */
	public function testGenericOutlineStoresNothingOnPreview(): void {
		$html = $this->renderTag( [ 'article-type' => '*' ], null, true );

		$this->assertNull( $this->getStoredData() );
		$this->assertStringContainsString( 'ext-articleguidance-generic-note', $html );
	}

	/**
	 * A page with no article-type stores nothing, and is not reported as an
	 * invalid type either.
	 */
	public function testMissingArticleTypeStoresNothing(): void {
		$html = $this->renderTag( [] );

		$this->assertNull( $this->getStoredData() );
		$this->assertStringNotContainsString( 'ext-articleguidance-invalid', $html );
	}

	/**
	 * The restructure for the generic outline must leave a regular outline
	 * storing exactly what it stored before.
	 */
	public function testRegularOutlineStillStoresItsArticleTypes(): void {
		$this->renderTag( [ 'article-type' => 'Q4830453' ], null, false, [
			'label' => 'business',
			'description' => 'commercial organisation',
			'hierarchyDepth' => 5,
			'matchVia' => null,
			'image' => null,
		] );

		$data = $this->getStoredData();
		$this->assertNotNull( $data );
		$this->assertArrayNotHasKey( 'generic', $data );
		$this->assertSame( 'Q4830453', $data['articleType'] );
		$this->assertSame( 'Q4830453', $data['articleTypes'][0]['id'] );
		$this->assertSame( 5, $data['articleTypes'][0]['hierarchyDepth'] );
		// Stored capitalized, so page_props needs no fixing at read time
		$this->assertSame( 'Commercial organisation', $data['description'] );
	}
}
