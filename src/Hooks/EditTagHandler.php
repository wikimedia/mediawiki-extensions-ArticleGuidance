<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Api\ApiBase;
use MediaWiki\Api\ApiEditPage;
use MediaWiki\Api\Hook\APIGetAllowedParamsHook;
use MediaWiki\ChangeTags\ChangeTagsStore;
use MediaWiki\ChangeTags\Hook\ChangeTagsListActiveHook;
use MediaWiki\ChangeTags\Hook\ListDefinedTagsHook;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Json\FormatJson;
use MediaWiki\Page\Hook\RevisionFromEditCompleteHook;
use MediaWiki\RecentChanges\Hook\RecentChange_saveHook;
use MediaWiki\Revision\SlotRecord;
use Wikimedia\ParamValidator\ParamValidator;

class EditTagHandler implements
	APIGetAllowedParamsHook,
	ChangeTagsListActiveHook,
	ListDefinedTagsHook,
	RecentChange_saveHook,
	RevisionFromEditCompleteHook
{
	private const TAG = 'articleguidance';
	private const API_PARAM = 'articleguidance';
	// Both session values are maps keyed by prefixed title. The value carries the
	// selected Wikidata item Q-id, the outline title and the matched outline type
	// Q-id, so they stay paired with their own article across concurrent edits in
	// separate tabs.
	public const SESSION_EDITING = 'ArticleGuidanceEditing';
	public const SESSION_PUBLISHED = 'ArticleGuidancePublished';

	/**
	 * Cap on the number of in-flight titles tracked in each session set, so a
	 * session that starts many edits without publishing cannot grow unbounded.
	 */
	public const MAX_TRACKED = 50;

	/**
	 * Tag params for revisions tagged in this request, keyed by revision ID.
	 * RevisionFromEditComplete knows the params, but the tag is applied later,
	 * when the recent change is saved.
	 *
	 * @var array<int,string>
	 */
	private array $pendingTagParams = [];

	/**
	 * Read a value of a session map. Values from before the outline was tracked
	 * are the item Q-id or true.
	 *
	 * @param mixed $value
	 * @return array{item: ?string, outline: ?string, matchedQid: ?string}
	 */
	public static function readTrackedEdit( mixed $value ): array {
		if ( is_array( $value ) ) {
			return [
				'item' => is_string( $value['item'] ?? null ) ? $value['item'] : null,
				'outline' => is_string( $value['outline'] ?? null ) ? $value['outline'] : null,
				'matchedQid' => is_string( $value['matchedQid'] ?? null ) ? $value['matchedQid'] : null,
			];
		}
		return [ 'item' => is_string( $value ) ? $value : null, 'outline' => null, 'matchedQid' => null ];
	}

	public function __construct(
		private readonly ArticleGuidanceInstrumentFactory $instrumentFactory,
		private readonly ChangeTagsStore $changeTagsStore,
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
	 * Apply the tag with its params before core applies the tags of the recent
	 * change. Core then skips the tag, because the change already has it. When no
	 * recent change is saved, core applies the tag without params.
	 *
	 * @inheritDoc
	 */
	public function onRecentChange_save( $recentChange ) {
		$revId = (int)$recentChange->getAttribute( 'rc_this_oldid' );
		if ( !isset( $this->pendingTagParams[ $revId ] ) ) {
			return;
		}

		$this->changeTagsStore->addTags(
			self::TAG,
			$recentChange->getAttribute( 'rc_id' ),
			$revId,
			null,
			$this->pendingTagParams[ $revId ],
			$recentChange
		);
		unset( $this->pendingTagParams[ $revId ] );
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

		$fromApi = $request->getCheck( self::API_PARAM );
		$editing = $session->get( self::SESSION_EDITING );
		$fromSession = is_array( $editing ) && isset( $editing[ $titleText ] );

		if ( !$fromApi && !$fromSession ) {
			return;
		}

		$tags[] = self::TAG;
		$tracked = [ 'item' => null, 'outline' => null, 'matchedQid' => null ];

		if ( $fromSession ) {
			// Remove only this title; other tabs' in-flight edits stay tracked. Carry
			// its value into the published set so the post-publish module can connect
			// the new article to its item.
			$value = $editing[ $titleText ];
			$tracked = self::readTrackedEdit( $value );
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

		$tagParams = array_filter( [
			'outline' => $tracked['outline'],
			'matched_qid' => $tracked['matchedQid'],
		] );
		if ( $tagParams ) {
			$this->pendingTagParams[ $rev->getId() ] = FormatJson::encode( $tagParams, false, FormatJson::UTF8_OK );
		}

		// Article Guidance can create redirects itself (T426844), and those are
		// reported by their own redirect_created event. Leaving them out here keeps
		// article_saved measuring article creation only.
		$content = $rev->getContent( SlotRecord::MAIN );
		if ( $content && $content->isRedirect() ) {
			return;
		}

		$this->instrumentFactory->getInstrument()?->send( 'article_saved', [
			'action_source' => 'articleguidance',
			'page' => [
				'title' => $titleText,
				'id' => $wikiPage->getId(),
				'namespace_id' => $wikiPage->getTitle()->getNamespace(),
			],
			'action_context' => [
				'outline' => [
					'title' => $tracked['outline'],
					'matched_qid' => $tracked['matchedQid'],
				],
			],
		] );
	}
}
