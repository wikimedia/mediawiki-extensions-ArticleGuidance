<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Hook\BeforePageDisplayHook;

class PublishFollowUpHandler implements BeforePageDisplayHook {

	/**
	 * Load the post-publish follow-up module on content pages for logged-in users.
	 * The module self-exits if no articleguidance-published flag is found in sessionStorage.
	 *
	 * @inheritDoc
	 */
	public function onBeforePageDisplay( $out, $skin ): void {
		if ( !$out->getUser()->isAnon() && $out->getTitle()->isContentPage() ) {
			$out->addModules( 'ext.articleguidance.publishingfollowup' );
		}
	}
}
