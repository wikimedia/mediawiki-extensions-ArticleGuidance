<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Hook\BeforeInitializeHook;
use MediaWiki\Page\Hook\RevisionFromEditCompleteHook;
use MediaWiki\Page\WikiPage;

class EditTagHandler implements
	BeforeInitializeHook,
	ChangeTagsListActiveHook,
	ListDefinedTagsHook,
	RevisionFromEditCompleteHook
{

	private const TAG = 'articleguidance';
	private const SESSION_EDITING = 'ArticleGuidanceEditing';
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
	public function onBeforeInitialize( $title, $unused, $output, $user, $request, $mediaWiki ): void {
		if (
			$title !== null
			&& $request->getCheck( 'articleguidance' )
			&& ( $request->getVal( 'action' ) === 'edit' || $request->getVal( 'veaction' ) === 'edit' )
		) {
			$request->getSession()->set( self::SESSION_EDITING, $title->getPrefixedText() );
		}
	}

	/**
	 * @inheritDoc
	 */
	public function onRevisionFromEditComplete( $wikiPage, $rev, $originalRevId, $user, &$tags ): void {
		$request = RequestContext::getMain()->getRequest();
		$session = $request->getSession();
		if ( $session->get( self::SESSION_EDITING ) === $wikiPage->getTitle()->getPrefixedText() ) {
			$tags[] = self::TAG;
			$session->remove( self::SESSION_EDITING );
			$session->set( self::SESSION_PUBLISHED, $wikiPage->getTitle()->getPrefixedText() );
			$this->sendArticleSavedEvent( $wikiPage );
		}
	}

	private function sendArticleSavedEvent( WikiPage $wikiPage ): void {
		$this->experimentFactory->getExperiment()?->send( 'article_saved', [
			'page' => [
				'title' => $wikiPage->getTitle()->getPrefixedText(),
				'id' => $wikiPage->getId(),
			]
		] );
	}
}
