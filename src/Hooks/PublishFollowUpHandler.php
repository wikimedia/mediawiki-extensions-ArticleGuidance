<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Hook\BeforePageDisplayHook;

class PublishFollowUpHandler implements BeforePageDisplayHook {

	/**
	 * Load the post-publish follow-up module after an ArticleGuidance publish.
	 *
	 * A short-lived cookie set by EditTagHandler signals that the current page view
	 * immediately follows an ArticleGuidance publish. The JS module performs a further
	 * sessionStorage check to confirm the title matches and ensures one-shot display.
	 *
	 * @inheritDoc
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		$request = $out->getRequest();
		if (
			!$out->getUser()->isAnon()
			&& $out->getTitle()->isContentPage()
			&& $request->getCookie( 'ag-published' )
		) {
			$out->addModules( 'ext.articleguidance.publishingfollowup' );
			$request->response()->clearCookie( 'ag-published' );
		}
	}
}
