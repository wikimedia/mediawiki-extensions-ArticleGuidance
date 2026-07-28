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

		$wikidataImage = null;
		// Renderer-facing list of { id, label, description, matchVia } entries;
		// labels/descriptions are resolved against Wikidata below when not previewing
		$renderTypes = [];

		if ( $articleType !== null ) {
			$wikidataIds = $this->parseArticleTypes( $articleType );
			if ( $wikidataIds !== [] ) {
				foreach ( $wikidataIds as $id ) {
					$renderTypes[] = [
						'id' => $id,
						'label' => null,
						'description' => null,
						'matchVia' => $explicitMatchVia,
					];
				}

				if ( !$parser->getOptions()->getIsPreview() ) {
					// Get user language
					$language = $parser->getContentLanguage()->getCode();

					// Fetch entity data per ID; each ID keeps its own hierarchy
					// depth and match-via since both are properties of the item
					$typeEntries = [];
					foreach ( $wikidataIds as $i => $id ) {
						$entityData = $this->wikidataInfoFetcher->fetchEntityCached(
							$id, $language, $explicitMatchVia
						);
						// Use inferred match-via from entity data; explicit override takes precedence
						$entryMatchVia = $explicitMatchVia ?? $entityData['matchVia'] ?? null;
						$typeEntries[] = [
							'id' => $id,
							'hierarchyDepth' => $entityData['hierarchyDepth'] ?? null,
							'matchVia' => $entryMatchVia,
						];
						$renderTypes[$i]['label'] = $entityData['label'] ?? null;
						$renderTypes[$i]['description'] = $entityData['description'] ?? null;
						$renderTypes[$i]['matchVia'] = $entryMatchVia;
						if ( $i === 0 ) {
							// The first (primary) ID supplies the stored
							// outline's image
							$wikidataImage = $entityData['image'] ?? null;
						}
					}

					// The primary ID also supplies the stored outline's label and
					// description; a custom label takes precedence over Wikidata's
					$displayLabel = $customLabel !== '' ? $customLabel : $renderTypes[0]['label'];
					$primaryDescription = $renderTypes[0]['description'];

					$description = $primaryDescription !== null ? ucfirst( $primaryDescription ) : null;
					$data = [
						// Singular primary ID kept for rollback compatibility with
						// pre-multi-item readers; runtime consumers use articleTypes
						'articleType' => $wikidataIds[0],
						'articleTypes' => $typeEntries,
					];
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

				// On the rendered card, a custom label replaces the primary
				// entry's label; other entries keep their Wikidata labels
				if ( $customLabel !== '' ) {
					$renderTypes[0]['label'] = $customLabel;
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
			$renderTypes,
			$articleType,
			$validTags,
			$invalidTags,
			$instructionsHtml,
			$recommendedSourcesHtml,
			$discouragedSourcesHtml,
			$wikidataImage,
			$notabilityThresholds,
			$categoryNoteHtml
		);

		return $html;
	}

	/**
	 * Parse the article-type attribute into a list of Wikidata Q IDs.
	 *
	 * Accepts one or more whitespace-separated Q IDs. Returns an empty array
	 * when the attribute is blank or any token is malformed, so a typo
	 * invalidates the whole attribute instead of silently matching fewer types.
	 *
	 * @param string $value Attribute value to parse
	 * @return string[] Unique Q IDs in authoring order; the first is the primary
	 */
	private function parseArticleTypes( string $value ): array {
		$tokens = preg_split( '/\s+/', trim( $value ), -1, PREG_SPLIT_NO_EMPTY );
		$ids = [];
		foreach ( $tokens as $token ) {
			if ( !$this->isValidWikidataId( $token ) ) {
				return [];
			}
			if ( !in_array( $token, $ids, true ) ) {
				$ids[] = $token;
			}
		}
		return $ids;
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
