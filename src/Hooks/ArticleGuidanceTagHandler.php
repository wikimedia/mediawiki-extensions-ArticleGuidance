<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Parser\Hook\ParserFirstCallInitHook;
use MediaWiki\Parser\Parser;
use MediaWiki\Parser\ParserOutput;
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
		$output = $parser->getOutput();

		// Add CSS module styles (loaded in <head>)
		$output->addModuleStyles( [ 'ext.articleguidance.tag.styles' ] );

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

		// Parse instructions for display in the tag
		$instructionsHtml = null;
		if ( $content !== null && trim( $content ) !== '' ) {
			$instructionsHtml = $parser->recursiveTagParse( $content, $frame );
		}

		// Validate article-type format (Q12345)
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

					$entityData = $this->fetchWikidataEntity( $wikidataId, $language, $explicitMatchVia );
					if ( $entityData ) {
						$wikidataLabel = $entityData['label'] ?? null;
						$wikidataDescription = $entityData['description'] ?? null;
						$wikidataImage = $entityData['image'] ?? null;
						$hierarchyDepth = $entityData['hierarchyDepth'] ?? null;
						// Use inferred match-via from entity data; explicit override takes precedence
						$matchVia = $explicitMatchVia ?? $entityData['matchVia'] ?? null;
					}

					$this->storeGuidanceData(
						$output, $wikidataId, $wikidataLabel, $wikidataDescription,
						$wikidataImage, $validTags, $hierarchyDepth, $matchVia
					);
				} else {
					// In preview mode, don't fetch from Wikidata; inference is unavailable
					$this->storeGuidanceData(
						$output, $wikidataId, null, null, null, $validTags, null, $explicitMatchVia
					);
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
	 * Fetch Wikidata entity information
	 *
	 * @param string $wikidataId Wikidata ID
	 * @param string $language Language code
	 * @param string|null $matchVia Wikidata property ID used for outline matching, or null for default
	 * @return array|null Array with 'label', 'description', 'image', and 'hierarchyDepth', or null
	 */
	private function fetchWikidataEntity( string $wikidataId, string $language, ?string $matchVia = null ): ?array {
		return $this->wikidataInfoFetcher->fetchEntityCached( $wikidataId, $language, $matchVia );
	}

	/**
	 * Store article guidance data in parser output
	 *
	 * @param ParserOutput $output
	 * @param string $wikidataId
	 * @param string|null $label
	 * @param string|null $description
	 * @param string|null $image
	 * @param array $notabilityRisk Valid notability-risk tags
	 * @param int|null $hierarchyDepth
	 * @param string|null $matchVia Wikidata property ID used for matching (e.g. 'P106'), or null for default
	 */
	private function storeGuidanceData(
		ParserOutput $output,
		string $wikidataId,
		?string $label,
		?string $description,
		?string $image,
		array $notabilityRisk,
		?int $hierarchyDepth,
		?string $matchVia = null
	): void {
		$output->setExtensionData( 'ArticleGuidance:data', [
			'articleType' => $wikidataId,
			'label' => $label,
			'description' => $description,
			'image' => $image,
			'notabilityRisk' => $notabilityRisk,
			'hierarchyDepth' => $hierarchyDepth,
			'notabilityThresholds' => self::NOTABILITY_TAG_THRESHOLDS,
			'matchVia' => $matchVia
		] );
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
}
