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
		$session = $out->getRequest()->getSession();
		if (
			!$out->getUser()->isAnon()
			&& $out->getTitle()->isContentPage()
			&& $session->get( EditTagHandler::SESSION_PUBLISHED ) === $out->getTitle()->getPrefixedText()
		) {
			$out->addModules( 'ext.articleguidance.publishingfollowup' );
			$session->remove( EditTagHandler::SESSION_PUBLISHED );
		}
	}
}
