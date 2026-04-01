<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\Page\Hook\RevisionFromEditCompleteHook;

class EditTagHandler implements ChangeTagsListActiveHook, ListDefinedTagsHook, RevisionFromEditCompleteHook {

	private const TAG = 'articleguidance';

	/**
	 * @inheritDoc
	 */
	public function onListDefinedTags( &$tags ): void {
		$tags[] = self::TAG;
	}

	/**
	 * @inheritDoc
	 */
	public function onChangeTagsListActive( &$tags ): void {
		$tags[] = self::TAG;
	}

	/**
	 * @inheritDoc
	 */
	public function onRevisionFromEditComplete( $wikiPage, $rev, $originalRevId, $user, &$tags ): void {
		$request = RequestContext::getMain()->getRequest();
		if ( $request->getCheck( 'articleguidance' ) ) {
			$tags[] = self::TAG;
		}
	}
}
