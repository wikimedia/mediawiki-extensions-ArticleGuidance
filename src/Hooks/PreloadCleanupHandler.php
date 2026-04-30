<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Hook\EditFormPreloadTextHook;

class PreloadCleanupHandler implements EditFormPreloadTextHook {

	/**
	 * Prepare the outline to be used as preload in the editor
	 *
	 * @inheritDoc
	 */
	public function onEditFormPreloadText( &$text, $title ): void {
		// Return early if the preload page is not an outline
		if ( !str_contains( $text, '<article-guidance' ) ) {
			return;
		}

		// Extract the category attribute so it can be turned into a category link
		$category = null;
		if ( preg_match( '/<article-guidance\b[^>]*\bcategory="([^"]*)"/', $text, $matches ) ) {
			// Strip characters that are illegal in page titles or would break [[Category:...]] syntax
			$category = preg_replace( '/[\[\]{}|<>#\n\r]/', '', trim( $matches[1] ) ) ?: null;
		}

		// Remove the <article-guidance> tag entirely
		$text = preg_replace(
			'/<article-guidance[^>]*>.*?<\/article-guidance>\n?/s',
			'',
			$text
		);

		// Trim the rest of the text to avoid leaving empty lines after tag removal
		$text = trim( $text );

		// Append category link if a category was specified
		if ( $category !== null ) {
			$text .= "\n[[Category:" . $category . "]]";
		}
	}
}
