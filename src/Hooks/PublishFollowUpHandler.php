<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Hook\BeforePageDisplayHook;

class PublishFollowUpHandler implements BeforePageDisplayHook {

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
			// Consume only this title's flag; other just-published articles keep theirs.
			unset( $published[ $titleText ] );
			$session->set( EditTagHandler::SESSION_PUBLISHED, $published );
		}
	}
}
