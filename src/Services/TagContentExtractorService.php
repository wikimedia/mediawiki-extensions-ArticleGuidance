<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

/**
 * Service for extracting sources and instructions from wikitext or HTML content.
 */
class TagContentExtractorService {
	/**
	 * Extract a list of sources from a pseudo-tag in raw wikitext.
	 *
	 * @param string $wikitext The raw wikitext
	 * @param string $tagName The tag name to extract (e.g., 'recommended-sources')
	 * @return array List of sources (strings) divided into info and URLs
	 */
	public function extractSources( string $wikitext, string $tagName ): array {
		$infoArray = [];
		$urlsArray = [];
		if ( preg_match( "/<$tagName>(.*?)<\/$tagName>/is", $wikitext, $blockMatch ) ) {
			$block = $blockMatch[1];
			// Extract <info> tags
			if ( preg_match_all( "/<info>(.*?)<\/info>/is", $block, $infoMatches ) ) {
				foreach ( $infoMatches[1] as $info ) {
					$text = trim( strip_tags( $info ) );
					if ( $text !== '' ) {
						$infoArray[] = $text;
					}
				}
			}
			// Extract <source> tags (e.g., URLs)
			if ( preg_match_all( "/<source>(.*?)<\/source>/is", $block, $sourceMatches ) ) {
				foreach ( $sourceMatches[1] as $source ) {
					$text = trim( strip_tags( $source ) );
					if ( $text !== '' ) {
						$urlsArray[] = $text;
					}
				}
			}
		}
		return [ $infoArray, $urlsArray ];
	}

	/**
	 * Extract the raw text instructions from a pseudo-tag in wikitext or HTML.
	 *
	 * @param string $content The wikitext or HTML content
	 * @return string|null The raw text inside the tag, or null if not found
	 */
	public function extractInstructions( string $content ): ?string {
		if ( preg_match( '/<instructions>(.*?)<\/instructions>/is', $content, $matches ) ) {
			return trim( $matches[1] );
		}
		return null;
	}
}
