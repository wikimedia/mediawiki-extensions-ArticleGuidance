<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Parser\Hook\ParserFirstCallInitHook;
use MediaWiki\Parser\Parser;
use MediaWiki\Parser\PPFrame;

/**
 * Handler for the <article-guidance> parser tag extension
 */
class ArticleGuidanceTagHandler implements
	ParserFirstCallInitHook
{

	private const KNOWN_NOTABILITY_TAGS = [ 'wikidata', 'crosswiki', 'sources', 'junior', 'draft' ];

	private const NOTABILITY_TAG_THRESHOLDS = [
		'crosswiki' => 5,
		'sources' => 2,
	];

	public function __construct(
		private readonly WikidataInfoFetcher $wikidataInfoFetcher,
		private readonly ArticleGuidanceRenderer $renderer,
		private readonly OutlineService $outlineService,
		private readonly TagContentExtractorService $tagContentExtractorService,
	) {
	}

	/**
	 * Register the article-guidance tag
	 *
	 * @param Parser $parser
	 * @return void
	 */
	public function onParserFirstCallInit( $parser ): void {
		$parser->setHook( 'article-guidance', [ $this, 'renderArticleGuidance' ] );
	}

	/**
	 * Callback for rendering the article-guidance tag
	 *
	 * @param string|null $content Content between the opening and closing tags
	 * @param array $attributes Tag attributes
	 * @param Parser $parser Parser object
	 * @param PPFrame $frame PPFrame object
	 * @return string Rendered output
	 */
	public function renderArticleGuidance(
		?string $content,
		array $attributes,
		Parser $parser,
		PPFrame $frame
	): string {
		// Add CSS module styles (loaded in <head>)
		$parser->getOutput()->addModuleStyles( [ 'ext.articleguidance.tag.styles' ] );

		// Add page to tracking category
		$parser->addTrackingCategory( 'articleguidance-tracking-category' );

		// Extract parameters
		$articleType = $attributes['article-type'] ?? null;
		$allTags = $this->parseNotabilityRisk( $attributes['notability-risk'] ?? null );
		$validTags = array_values( array_filter( $allTags,
			static fn ( $tag ) => in_array( $tag, self::KNOWN_NOTABILITY_TAGS, true )
		) );
		$invalidTags = array_values( array_filter( $allTags,
			static fn ( $tag ) => !in_array( $tag, self::KNOWN_NOTABILITY_TAGS, true )
		) );
		// Explicit match-via override from tag attribute; null means infer from Wikidata
		$explicitMatchVia = $attributes['match-via'] ?? null;
		if ( $explicitMatchVia !== null && !$this->isValidWikidataPropertyId( $explicitMatchVia ) ) {
			$explicitMatchVia = null;
		}
		$matchVia = $explicitMatchVia;

		// Parse instructions and sources for display in the tag
		$instructionsHtml = null;
		$recommendedSourcesHtml = [];
		$discouragedSourcesHtml = [];
		if ( $content !== null && trim( $content ) !== '' ) {
			$extractedInstructions = $this->tagContentExtractorService->extractInstructions( $content );
			if ( is_string( $extractedInstructions ) && trim( $extractedInstructions ) !== '' ) {
				$instructionsHtml = $parser->recursiveTagParseFully( $extractedInstructions, $frame );
			}

			$recommendedSourcesHtml = $this->extractAndParseSources( $content, 'recommended-sources', $parser, $frame );
			$discouragedSourcesHtml = $this->extractAndParseSources( $content, 'discouraged-sources', $parser, $frame );
		}

		$wikidataId = null;
		$wikidataLabel = null;
		$wikidataDescription = null;
		$wikidataImage = null;
		$hierarchyDepth = null;

		if ( $articleType !== null ) {
			if ( $this->isValidWikidataId( $articleType ) ) {
				$wikidataId = $articleType;

				if ( !$parser->getOptions()->getIsPreview() ) {
					// Get user language
					$language = $parser->getContentLanguage()->getCode();

					$entityData = $this->wikidataInfoFetcher->fetchEntityCached(
						$wikidataId, $language, $explicitMatchVia
					);
					if ( $entityData ) {
						$wikidataLabel = $entityData['label'] ?? null;
						$wikidataDescription = $entityData['description'] ?? null;
						$wikidataImage = $entityData['image'] ?? null;
						$hierarchyDepth = $entityData['hierarchyDepth'] ?? null;
						// Use inferred match-via from entity data; explicit override takes precedence
						$matchVia = $explicitMatchVia ?? $entityData['matchVia'] ?? null;
					}

					$description = $wikidataDescription !== null ? ucfirst( $wikidataDescription ) : null;
					$parser->getOutput()->setExtensionData( 'ArticleGuidance:data', [
						'articleType' => $wikidataId,
						'label' => $wikidataLabel,
						'description' => $description,
						'image' => $wikidataImage,
						'notabilityRisk' => $validTags,
						'hierarchyDepth' => $hierarchyDepth,
						'notabilityThresholds' => self::NOTABILITY_TAG_THRESHOLDS,
						'matchVia' => $matchVia,
						'instructions' => $instructionsHtml,
						'recommendedSources' => [
							'info' => $recommendedSourcesHtml[0] ?? [],
							'urls' => $recommendedSourcesHtml[1] ?? [],
						],
						'discouragedSources' => [
							'info' => $discouragedSourcesHtml[0] ?? [],
							'urls' => $discouragedSourcesHtml[1] ?? [],
						],
					] );
					$this->outlineService->touchOutlinesCheckKey();
				}
			}
		}

		// Render HTML using the renderer service
		$html = $this->renderer->render(
			$wikidataId,
			$wikidataLabel,
			$wikidataDescription,
			$articleType,
			$validTags,
			$invalidTags,
			$instructionsHtml,
			$recommendedSourcesHtml,
			$discouragedSourcesHtml,
			$wikidataImage,
			self::NOTABILITY_TAG_THRESHOLDS,
			$matchVia
		);

		return $html;
	}

	/**
	 * Validate if a string is a valid Wikidata ID (Q followed by digits)
	 *
	 * @param string $id String to validate
	 * @return bool True if valid Wikidata ID format
	 */
	private function isValidWikidataId( string $id ): bool {
		return (bool)preg_match( '/^Q\d+$/', trim( $id ) );
	}

	/**
	 * Validate if a string is a valid Wikidata property ID (P followed by digits)
	 *
	 * @param string $id String to validate
	 * @return bool True if valid Wikidata property ID format
	 */
	private function isValidWikidataPropertyId( string $id ): bool {
		return (bool)preg_match( '/^P\d+$/', trim( $id ) );
	}

	/**
	 * Parse the notability-risk attribute value into an array of tags
	 *
	 * Tags are separated by '/', ',', or whitespace. Returns an empty array
	 * for null or blank input. Both valid and unknown tags are returned.
	 *
	 * @param string|null $value Attribute value to parse
	 * @return array Parsed tag strings (lowercased, trimmed, non-empty)
	 */
	private function parseNotabilityRisk( ?string $value ): array {
		if ( $value === null || trim( $value ) === '' ) {
			return [];
		}
		$parts = preg_split( '/[\/,\s]+/', $value );
		$tags = [];
		foreach ( $parts as $part ) {
			$tag = strtolower( trim( $part ) );
			if ( $tag !== '' ) {
				$tags[] = $tag;
			}
		}
		return $tags;
	}

	/**
	 * Extracts sources of a given type from content, filters out null/empty, and parses with the parser.
	 *
	 * @param string $content Raw wikitext content
	 * @param string $sourceType 'recommended-sources' or 'discouraged-sources'
	 * @param Parser $parser Parser object
	 * @param PPFrame $frame PPFrame object
	 * @return array Array containing two arrays: parsed info HTML strings and parsed URL HTML strings
	 */
	private function extractAndParseSources(
		string $content,
		string $sourceType,
		Parser $parser,
		PPFrame $frame
	): array {
		[ $infoArray, $urlsArray ] = $this->tagContentExtractorService->extractSources( $content, $sourceType );

		$infoHtmlArray = array_map(
			static fn ( $info ) => $parser->recursiveTagParseFully( $info, $frame ),
			array_filter( $infoArray, static fn ( $info ) => is_string( $info ) && trim( $info ) !== '' )
		);

		$urlsHtmlArray = array_map(
			static fn ( $url ) => $parser->recursiveTagParseFully( $url, $frame ),
			array_filter( $urlsArray, static fn ( $url ) => is_string( $url ) && trim( $url ) !== '' )
		);

		return [ $infoHtmlArray, $urlsHtmlArray ];
	}
}
