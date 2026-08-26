<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Api\ApiBase;
use MediaWiki\Api\ApiEditPage;
use MediaWiki\Api\Hook\APIGetAllowedParamsHook;
use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Page\Hook\RevisionFromEditCompleteHook;
use MediaWiki\Revision\SlotRecord;
use Wikimedia\ParamValidator\ParamValidator;

class EditTagHandler implements
	APIGetAllowedParamsHook,
	ChangeTagsListActiveHook,
	ListDefinedTagsHook,
	RevisionFromEditCompleteHook
{
	private const TAG = 'articleguidance';
	private const API_PARAM = 'articleguidance';
	// Both session values are maps keyed by prefixed title. The value carries the
	// selected Wikidata item Q-id (or true when none was selected), so the item
	// stays paired with its own article across concurrent edits in separate tabs.
	public const SESSION_EDITING = 'ArticleGuidanceEditing';
	public const SESSION_PUBLISHED = 'ArticleGuidancePublished';

	/**
	 * Cap on the number of in-flight titles tracked in each session set, so a
	 * session that starts many edits without publishing cannot grow unbounded.
	 */
	public const MAX_TRACKED = 50;

	public function __construct(
		private readonly ArticleGuidanceInstrumentFactory $instrumentFactory,
	) {
	}

	/**
	 * Declare the marker parameter on action=edit.
	 *
	 * @inheritDoc
	 */
	public function onAPIGetAllowedParams( $module, &$params, $flags ) {
		if ( $module instanceof ApiEditPage ) {
			$params[ self::API_PARAM ] = [
				ParamValidator::PARAM_TYPE => 'boolean',
				ParamValidator::PARAM_DEFAULT => false,
				ApiBase::PARAM_HELP_MSG => 'apihelp-edit-param-' . self::API_PARAM,
			];
		}
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

		$fromApi = $request->getCheck( self::API_PARAM );
		$editing = $session->get( self::SESSION_EDITING );
		$fromSession = is_array( $editing ) && isset( $editing[ $titleText ] );

		if ( $fromApi || $fromSession ) {
			$tags[] = self::TAG;
			$eventData['action_source'] = 'articleguidance';
		}

		if ( $fromSession ) {
			// Remove only this title; other tabs' in-flight edits stay tracked. Carry
			// its value (the selected Wikidata item, or true) into the published set so
			// the post-publish module can connect the new article to its item.
			$value = $editing[ $titleText ];
			unset( $editing[ $titleText ] );
			$session->set( self::SESSION_EDITING, $editing );

			$published = $session->get( self::SESSION_PUBLISHED );
			$published = is_array( $published ) ? $published : [];
			$published[ $titleText ] = $value;
			$published = array_slice(
				$published,
				-self::MAX_TRACKED,
				length: null,
				preserve_keys: true
			);
			$session->set( self::SESSION_PUBLISHED, $published );
		}

		// Article Guidance can create redirects itself (T426844), and those are
		// reported by their own redirect_created event. Leaving them out here keeps
		// article_saved measuring article creation only.
		$content = $rev->getContent( SlotRecord::MAIN );
		if ( $content && $content->isRedirect() ) {
			return;
		}

		$this->instrumentFactory->getInstrument()?->send( 'article_saved', $eventData );
	}
}
