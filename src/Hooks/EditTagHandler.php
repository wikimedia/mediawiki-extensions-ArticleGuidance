<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Page\Hook\RevisionFromEditCompleteHook;

class EditTagHandler implements
	ChangeTagsListActiveHook,
	ListDefinedTagsHook,
	RevisionFromEditCompleteHook
{

	private const TAG = 'articleguidance';
	public const SESSION_EDITING = 'ArticleGuidanceEditing';
	public const SESSION_PUBLISHED = 'ArticleGuidancePublished';

	public function __construct(
		private readonly ArticleGuidanceExperimentFactory $experimentFactory,
	) {
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
	public function onRevisionFromEditComplete( $wikiPage, $rev, $originalRevId, $user, &$tags ): void {
		if ( $rev->getParentId() > 0 ) {
			return;
		}

		$request = RequestContext::getMain()->getRequest();
		$session = $request->getSession();
		$titleText = $wikiPage->getTitle()->getPrefixedText();

		$eventData = [
			'page' => [
				'title' => $titleText,
				'id' => $wikiPage->getId(),
				'namespace_id' => $wikiPage->getTitle()->getNamespace(),
			]
		];

		if ( $session->get( self::SESSION_EDITING ) === $titleText ) {
			$tags[] = self::TAG;
			$session->remove( self::SESSION_EDITING );
			$session->set( self::SESSION_PUBLISHED, $titleText );
			$eventData['action_source'] = 'articleguidance';
		}

		$this->experimentFactory->getExperiment()?->send( 'article_saved', $eventData );
	}
}
