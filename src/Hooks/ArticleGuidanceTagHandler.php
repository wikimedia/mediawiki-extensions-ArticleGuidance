<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Message\Message;
use MediaWiki\Parser\Hook\ParserFirstCallInitHook;
use MediaWiki\Parser\Parser;
use MediaWiki\Parser\PPFrame;
use MediaWiki\Title\Title;

/**
 * Handler for the <article-guidance> parser tag extension
 */
class ArticleGuidanceTagHandler implements
	ParserFirstCallInitHook
{

	private const KNOWN_NOTABILITY_TAGS = [ 'wikidata', 'crosswiki', 'sources', 'junior', 'draft' ];

	public function __construct(
		private readonly WikidataInfoFetcher $wikidataInfoFetcher,
		private readonly ArticleGuidanceRenderer $renderer,
		private readonly TagContentExtractorService $tagContentExtractorService,
		private readonly Config $mainConfig,
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
		// Optional custom label that overrides the Wikidata-derived label everywhere
		$customLabel = trim( $attributes['label'] ?? '' );
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

		$category = null;
		$rawCategory = trim( $attributes['category'] ?? '' );
		if ( $rawCategory !== '' ) {
			$categoryTitle = Title::newFromText( 'Category:' . $rawCategory );
			$category = $categoryTitle ? $categoryTitle->getText() : null;
		}

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

		$notabilityThresholds = [
			'crosswiki' => $this->mainConfig->get( 'ArticleGuidanceCrossWikiThreshold' ),
		];

		$wikidataId = null;
		$wikidataLabel = null;
		$wikidataDescription = null;
		$wikidataImage = null;
		$hierarchyDepth = null;
		// Effective label used for storage and rendering; resolved against Wikidata below
		$displayLabel = $customLabel !== '' ? $customLabel : null;

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

					// Custom label takes precedence over the Wikidata label
					$displayLabel = $customLabel !== '' ? $customLabel : $wikidataLabel;

					$description = $wikidataDescription !== null ? ucfirst( $wikidataDescription ) : null;
					$data = [ 'articleType' => $wikidataId ];
					if ( $displayLabel !== null && $displayLabel !== '' ) {
						$data['label'] = $displayLabel;
					}
					if ( $description !== null && $description !== '' ) {
						$data['description'] = $description;
					}
					if ( $wikidataImage !== null ) {
						$data['image'] = $wikidataImage;
					}
					if ( $validTags !== [] ) {
						$data['notabilityRisk'] = $validTags;
					}
					if ( $hierarchyDepth !== null ) {
						$data['hierarchyDepth'] = $hierarchyDepth;
					}
					if ( $matchVia !== null ) {
						$data['matchVia'] = $matchVia;
					}
					if ( $instructionsHtml !== null && $instructionsHtml !== '' ) {
						$data['instructions'] = $instructionsHtml;
					}
					$recInfo = $recommendedSourcesHtml[0] ?? [];
					$recUrls = $recommendedSourcesHtml[1] ?? [];
					if ( $recInfo !== [] || $recUrls !== [] ) {
						$data['recommendedSources'] = [ 'info' => $recInfo, 'urls' => $recUrls ];
					}
					$disInfo = $discouragedSourcesHtml[0] ?? [];
					$disUrls = $discouragedSourcesHtml[1] ?? [];
					if ( $disInfo !== [] || $disUrls !== [] ) {
						$data['discouragedSources'] = [ 'info' => $disInfo, 'urls' => $disUrls ];
					}
					$parser->getOutput()->setPageProperty( 'articleguidance-data', json_encode( $data ) );
				}
			}
		}

		// Localize in the parser's target/content language so the cached output is
		// correct for all viewers, not just whoever renders the page first.
		$targetLanguage = $parser->getTargetLanguage();

		// Parse the category note with the page parser (avoids Message::parse()
		// spinning up a nested global parser inside this parse).
		$categoryNoteHtml = null;
		if ( $category !== null ) {
			$noteText = Message::newFromKey(
				'articleguidance-category-note',
				'[[:Category:' . $category . ']]'
			)->inLanguage( $targetLanguage )->plain();
			$categoryNoteHtml = $parser->recursiveTagParseFully( $noteText, $frame );
		}

		// Render HTML using the renderer service
		$html = $this->renderer->render(
			$targetLanguage,
			$wikidataId,
			$displayLabel,
			$wikidataDescription,
			$articleType,
			$validTags,
			$invalidTags,
			$instructionsHtml,
			$recommendedSourcesHtml,
			$discouragedSourcesHtml,
			$wikidataImage,
			$notabilityThresholds,
			$matchVia,
			$categoryNoteHtml
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
	 * Returns two arrays:
	 *   [0] info HTML strings (parsed, outer <p> stripped)
	 *   [1] plain URL strings (for domain matching and display)
	 *
	 * @param string $content Raw wikitext content
	 * @param string $sourceType 'recommended-sources' or 'discouraged-sources'
	 * @param Parser $parser Parser object
	 * @param PPFrame $frame PPFrame object
	 * @return array Array containing two arrays as described above
	 */
	private function extractAndParseSources(
		string $content,
		string $sourceType,
		Parser $parser,
		PPFrame $frame
	): array {
		[ $infoArray, $urlsArray ] = $this->tagContentExtractorService->extractSources( $content, $sourceType );

		$infoHtmlArray = array_map(
			fn ( $info ) => self::stripOuterParagraph( $parser->recursiveTagParseFully( $info, $frame ) ),
			array_filter( $infoArray, static fn ( $info ) => is_string( $info ) && trim( $info ) !== '' )
		);

		$cleanUrlsArray = array_values(
			array_filter( $urlsArray, static fn ( $url ) => is_string( $url ) && trim( $url ) !== '' )
		);

		return [ $infoHtmlArray, $cleanUrlsArray ];
	}

	/**
	 * Strip a single wrapping <p>...</p> from parsed HTML output.
	 *
	 * @param string $html
	 * @return string
	 */
	private static function stripOuterParagraph( string $html ): string {
		return preg_replace( '/^\s*<p>(.*)<\/p>\s*$/s', '$1', trim( $html ) ) ?? $html;
	}
}
