<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\ChangeTags\ChangeTagsStore;
use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\RecentChanges\Hook\RecentChange_saveHook;

class EditTagHandler implements ChangeTagsListActiveHook, ListDefinedTagsHook, RecentChange_saveHook {

	private const TAG = 'articleguidance';

	private ChangeTagsStore $changeTagsStore;

	public function __construct( ChangeTagsStore $changeTagsStore ) {
		$this->changeTagsStore = $changeTagsStore;
	}

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
	public function onRecentChange_save( $recentChange ): void {
		$request = RequestContext::getMain()->getRequest();
		if ( !$request->getCheck( 'articleguidance' ) ) {
			return;
		}

		$rcId = $recentChange->getAttribute( 'rc_id' ) ?: null;
		$revId = $recentChange->getAttribute( 'rc_this_oldid' ) ?: null;
		$this->changeTagsStore->addTags( [ self::TAG ], $rcId, $revId );
	}
}
