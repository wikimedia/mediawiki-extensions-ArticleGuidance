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

	/**
	 * Cap on the number of in-flight titles tracked in each session set, so a
	 * session that starts many edits without publishing cannot grow unbounded.
	 */
	public const MAX_TRACKED = 50;

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

		$editing = $session->get( self::SESSION_EDITING );
		if ( is_array( $editing ) && isset( $editing[ $titleText ] ) ) {
			$tags[] = self::TAG;
			// Remove only this title; other tabs' in-flight edits stay tracked.
			unset( $editing[ $titleText ] );
			$session->set( self::SESSION_EDITING, $editing );

			$published = $session->get( self::SESSION_PUBLISHED );
			$published = is_array( $published ) ? $published : [];
			$published[ $titleText ] = true;
			$published = array_slice(
				$published,
				-self::MAX_TRACKED,
				length: null,
				preserve_keys: true
			);
			$session->set( self::SESSION_PUBLISHED, $published );

			$eventData['action_source'] = 'articleguidance';
		}

		$this->experimentFactory->getExperiment()?->send( 'article_saved', $eventData );
	}
}
