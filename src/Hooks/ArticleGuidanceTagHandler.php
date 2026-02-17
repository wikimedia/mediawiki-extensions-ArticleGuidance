<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use Parser;
use PPFrame;

/**
 * Handler for the <article-guidance> parser tag extension
 */
class ArticleGuidanceTagHandler {

	private WikidataInfoFetcher $wikidataInfoFetcher;
	private ArticleGuidanceRenderer $renderer;

	public function __construct(
		WikidataInfoFetcher $wikidataInfoFetcher,
		ArticleGuidanceRenderer $renderer
	) {
		$this->wikidataInfoFetcher = $wikidataInfoFetcher;
		$this->renderer = $renderer;
	}

	/**
	 * Register the article-guidance tag
	 *
	 * @param Parser $parser
	 * @return void
	 */
	public function onParserFirstCallInit( Parser $parser ): void {
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
		$notabilityRisk = $this->parseBoolean( $attributes['notability-risk'] ?? null );

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

					$entityData = $this->fetchWikidataEntity( $wikidataId, $language );
					if ( $entityData ) {
						$wikidataLabel = $entityData['label'] ?? null;
						$wikidataDescription = $entityData['description'] ?? null;
						$wikidataImage = $entityData['image'] ?? null;
						$hierarchyDepth = $entityData['hierarchyDepth'] ?? null;
					}

					$this->storeGuidanceData(
						$output, $wikidataId, $wikidataLabel, $wikidataDescription,
						$wikidataImage, $notabilityRisk, $hierarchyDepth
					);
				} else {
					// In preview mode, don't fetch from Wikidata
					$this->storeGuidanceData( $output, $wikidataId, null, null, null, $notabilityRisk, null );
				}
			}
		}

		// Render HTML using the renderer service
		$html = $this->renderer->render(
			$wikidataId,
			$wikidataLabel,
			$wikidataDescription,
			$articleType,
			$notabilityRisk ?? false,
			$instructionsHtml,
			$wikidataImage
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
	 * Fetch Wikidata entity information
	 *
	 * @param string $wikidataId Wikidata ID
	 * @param string $language Language code
	 * @return array|null Array with 'label', 'description', 'image', and 'hierarchyDepth', or null
	 */
	private function fetchWikidataEntity( string $wikidataId, string $language ): ?array {
		return $this->wikidataInfoFetcher->fetchEntityCached( $wikidataId, $language );
	}

	/**
	 * Store article guidance data in parser output
	 *
	 * @param \ParserOutput $output
	 * @param string $wikidataId
	 * @param string|null $label
	 * @param string|null $description
	 * @param string|null $image
	 * @param bool|null $notabilityRisk
	 * @param int|null $hierarchyDepth
	 */
	private function storeGuidanceData(
		\ParserOutput $output,
		string $wikidataId,
		?string $label,
		?string $description,
		?string $image,
		?bool $notabilityRisk,
		?int $hierarchyDepth
	): void {
		$output->setExtensionData( 'ArticleGuidance:data', [
			'articleType' => $wikidataId,
			'label' => $label,
			'description' => $description,
			'image' => $image,
			'notabilityRisk' => $notabilityRisk ?? false,
			'hierarchyDepth' => $hierarchyDepth
		] );
	}

	/**
	 * Parse a string value as a boolean
	 *
	 * @param string|null $value String to parse
	 * @return bool|null Boolean value, or null if not parseable
	 */
	private function parseBoolean( ?string $value ): ?bool {
		if ( $value === null ) {
			return null;
		}
		$normalized = strtolower( trim( $value ) );
		if ( $normalized === 'true' || $normalized === '1' ) {
			return true;
		}
		if ( $normalized === 'false' || $normalized === '0' || $normalized === '' ) {
			return false;
		}
		return null;
	}
}
