<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Hook\EditFormPreloadTextHook;

class PreloadCleanupHandler implements EditFormPreloadTextHook {

	/**
	 * Remove the <article-guidance> tag from the preload text before
	 * it is loaded in the editor.
	 * Also trim whitespaces to avoid leaving an empty line after removing the tag.
	 *
	 * @inheritDoc
	 */
	public function onEditFormPreloadText( &$text, $title ): void {
		$text = preg_replace(
			'/<article-guidance[^>]*>.*?<\/article-guidance>\n?/s',
			'',
			$text
		);
		$text = trim( $text );
	}
}
