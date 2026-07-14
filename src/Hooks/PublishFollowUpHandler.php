<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Hook\BeforePageDisplayHook;

class PublishFollowUpHandler implements BeforePageDisplayHook {

	public function __construct(
		private readonly Config $config,
	) {
	}

	/**
	 * Load the post-publish follow-up module after an ArticleGuidance publish.
	 *
	 * A session flag set by EditTagHandler signals that the current page view
	 * immediately follows an ArticleGuidance publish.
	 *
	 * @inheritDoc
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		if ( $out->getUser()->isAnon() || !$out->getTitle()?->isContentPage() ) {
			return;
		}
		$session = $out->getRequest()->getSession();
		$titleText = $out->getTitle()->getPrefixedText();
		$published = $session->get( EditTagHandler::SESSION_PUBLISHED );
		if ( is_array( $published ) && isset( $published[ $titleText ] ) ) {
			$out->addModules( 'ext.articleguidance.publishingfollowup' );

			// The map value is the selected Wikidata item (or true). Hand it to the
			// client so it can connect the new article. Gated by a config flag so
			// dev/test/beta never write to Wikidata: when disabled, the id is never
			// exposed and the client makes no request at all. Restricted to the main
			// namespace so drafts and user sandboxes are never connected to an item.
			$item = $published[ $titleText ];
			if (
				$this->config->get( 'ArticleGuidanceWikidataConnectEnabled' )
				&& $out->getTitle()->getNamespace() === NS_MAIN
				&& is_string( $item )
				&& preg_match( '/^Q\d+$/', $item )
			) {
				$out->addJsConfigVars( [
					'wgArticleGuidanceConnectItemId' => $item,
				] );
			}

			// Consume only this title's entry; other just-published articles keep theirs.
			unset( $published[ $titleText ] );
			$session->set( EditTagHandler::SESSION_PUBLISHED, $published );
		}
	}
}
