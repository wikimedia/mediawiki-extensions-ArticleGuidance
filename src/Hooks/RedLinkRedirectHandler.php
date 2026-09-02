<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Hook\BeforeInitializeHook;
use MediaWiki\Logging\DatabaseLogEntry;
use MediaWiki\Output\OutputPage;
use MediaWiki\Request\WebRequest;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use MediaWiki\User\Options\UserOptionsLookup;
use MediaWiki\User\User;
use Wikimedia\Rdbms\IConnectionProvider;

class RedLinkRedirectHandler implements BeforeInitializeHook {

	public function __construct(
		private readonly TitleExtractor $titleExtractor,
		private readonly Config $mainConfig,
		private readonly TitleFactory $titleFactory,
		private readonly ArticleGuidanceInstrumentFactory $instrumentFactory,
		private readonly UserOptionsLookup $userOptionsLookup,
		private readonly IConnectionProvider $connectionProvider,
	) {
	}

	/**
	 * Check whether a title has a deletion or move log entry, i.e. the article
	 * was previously deleted or moved away (a move without leaving a redirect
	 * also turns the old title into a red link). Matches any 'move' entry, since
	 * a move that left a redirect makes the title exist and so cannot reach here.
	 */
	private function hasDeletionOrMoveLog( Title $title ): bool {
		$dbr = $this->connectionProvider->getReplicaDatabase();
		$row = DatabaseLogEntry::newSelectQueryBuilder( $dbr )
			->where( [
				'log_namespace' => $title->getNamespace(),
				'log_title' => $title->getDBkey(),
				'log_type' => [ 'delete', 'move' ],
			] )
			->caller( __METHOD__ )
			->fetchRow();
		return $row !== false;
	}

	private function hasArticleGuidanceEnabled( User $user ): bool {
		return $this->userOptionsLookup->getBoolOption( $user, 'articleguidance-enable' );
	}

	/**
	 * Check if a title is a red-link article edit request.
	 *
	 * @param Title $title
	 * @param WebRequest $request
	 * @return bool
	 */
	private function isArticleRedLink( Title $title, WebRequest $request ): bool {
		return $request->getVal( 'action' ) === 'edit'
			&& $request->getVal( 'redlink' ) === '1'
			&& $title->getNamespace() === NS_MAIN
			&& !$title->exists();
	}

	/**
	 * Check whether the redirect to Article Guidance is enabled on this wiki.
	 *
	 * @return bool
	 */
	private function isRedirectEnabled(): bool {
		return (bool)$this->mainConfig->get( 'ArticleGuidanceRedirectEnabled' );
	}

	/**
	 * Resolve the referer URL from a request to a Title object.
	 *
	 * @param WebRequest $request
	 * @return Title|null
	 */
	private function getRefererTitle( WebRequest $request ): ?Title {
		$refererUrl = $request->getHeader( 'Referer' );
		$refererTitle = $this->titleExtractor->extractPageTitle( $refererUrl ?: '' );
		if ( $refererTitle === null ) {
			return null;
		}
		return $this->titleFactory->newFromText( $refererTitle );
	}

	/**
	 * Check whether the request's referer page is within the configured scope.
	 *
	 * Title matching normalises both sides to DB keys to handle spaces/underscores and namespace
	 * aliases. Category matching performs a DB query and only runs when the title list produces
	 * no match. If both lists are empty, all referers are considered in scope.
	 *
	 * @param WebRequest $request
	 * @return bool
	 */
	private function isRefererInScope( WebRequest $request ): bool {
		$refererTitles = $this->mainConfig->get( 'ArticleGuidanceRedirectRefererTitles' );
		$refererCategories = $this->mainConfig->get( 'ArticleGuidanceRedirectRefererCategories' );

		if ( !is_array( $refererTitles ) || !is_array( $refererCategories ) ) {
			return false;
		}

		$refererTitles = array_filter( $refererTitles, 'is_string' );
		$refererCategories = array_filter( $refererCategories, 'is_string' );

		if ( $refererTitles === [] && $refererCategories === [] ) {
			return true;
		}

		$refTitle = $this->getRefererTitle( $request );
		if ( $refTitle === null ) {
			return false;
		}

		if ( $refererTitles !== [] ) {
			$refererDBKey = $refTitle->getPrefixedDBkey();
			foreach ( $refererTitles as $configuredTitle ) {
				$configTitle = $this->titleFactory->newFromText( $configuredTitle );
				if ( $configTitle !== null && $configTitle->getPrefixedDBkey() === $refererDBKey ) {
					return true;
				}
			}
		}

		if ( $refererCategories !== [] ) {
			$parentCategoryKeys = array_map(
				static fn ( Title $c ) => $c->getDBkey(),
				array_filter( array_map(
					fn ( $c ) => $this->titleFactory->newFromText( $c ),
					array_keys( $refTitle->getParentCategories() )
				) )
			);
			return array_intersect( $refererCategories, $parentCategoryKeys ) !== [];
		}

		return false;
	}

	/**
	 * Check whether the user can create an article.
	 *
	 * @param User $user
	 * @return bool
	 */
	private function isUserAllowed( User $user ): bool {
		return $user->isAllowed( 'createpage' ) && $user->getBlock() === null;
	}

	/**
	 * Check whether the user is within the target audience. All users are, unless
	 * ArticleGuidanceRedirectJuniorEditorsOnly limits the audience to junior editors.
	 *
	 * @param User $user
	 * @return bool
	 */
	private function isEditorInScope( User $user ): bool {
		if ( !$this->mainConfig->get( 'ArticleGuidanceRedirectJuniorEditorsOnly' ) ) {
			return true;
		}
		$editCount = $user->getEditCount() ?? 0;
		return $editCount < $this->mainConfig->get( 'ArticleGuidanceJuniorEditorThreshold' );
	}

	/**
	 * Perform redirect to Special:NewArticle
	 *
	 * @param OutputPage $output
	 * @param array $params Parameters to pass to the URL (e.g. 'newarticletitle', 'source').
	 * @return void
	 */
	private function performRedirect( OutputPage $output, array $params ): void {
		$specialPage = SpecialPage::getTitleFor( 'NewArticle' );
		$output->redirect( $specialPage->getFullURL( $params ) );
	}

	/**
	 * Check whether the current page is a configured entry-point title.
	 *
	 * @param Title $title
	 * @return bool
	 */
	private function isEntryPointPage( Title $title ): bool {
		$entryPointTitles = $this->mainConfig->get( 'ArticleGuidanceRedirectEntryPointTitles' );
		if ( !is_array( $entryPointTitles ) || $entryPointTitles === [] ) {
			return false;
		}
		$dbKey = $title->getPrefixedDBkey();
		foreach ( $entryPointTitles as $configured ) {
			if ( !is_string( $configured ) ) {
				continue;
			}
			$configTitle = $this->titleFactory->newFromText( $configured );
			if ( $configTitle !== null && $configTitle->getPrefixedDBkey() === $dbKey ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Send an event for each user who reaches an Article Guidance entry point, whether
	 * or not the redirect is enabled. These events are the funnel denominator.
	 *
	 * @param string $source Entry point: 'redlink' or 'articlewizard'.
	 * @param bool $redirected True when the user goes to Special:NewArticle.
	 */
	private function sendEntryPointEvent( string $source, bool $redirected ): void {
		$this->instrumentFactory->getInstrument()?->send( 'entry_point', [
			'action_source' => $source,
			'action_context' => json_encode( [ 'redirected' => $redirected ] ),
		] );
	}

	/**
	 * Send an event when the user starts to edit a new article.
	 *
	 * @param Title $title
	 * @param string $source How the user reached the editor: 'articleguidance' when they
	 *   came through Article Guidance, 'redlink' when they went directly to the editor.
	 */
	private function sendEditingStartedEvent( Title $title, string $source ): void {
		$this->instrumentFactory->getInstrument()?->send( 'editing_start', [
			'action_source' => $source,
			'page' => [
				'title' => $title->getPrefixedText(),
			]
		] );
	}

	/**
	 * @inheritDoc
	 */
	public function onBeforeInitialize( $title, $unused, $output, $user, $request, $mediaWikiEntryPoint ) {
		if ( $title === null || $user->isAnon() ) {
			return;
		}

		// Case 1: user arrived at the editor from Article Guidance
		if ( $request->getCheck( 'articleguidance' )
			&& ( $request->getVal( 'action' ) === 'edit' || $request->getVal( 'veaction' ) === 'edit' )
		) {
			// Load the VisualEditor tweaks module when entering VE from Article Guidance.
			$output->addModules( 'ext.articleguidance.ve' );

			$session = $request->getSession();
			$titleText = $title->getPrefixedText();
			// Track each in-flight edit by title so concurrent edits in separate tabs
			// don't clobber one another and all get tagged on publish. The stored value
			// is the specific Wikidata item the user selected (if any), so the article
			// can be connected to it once published; otherwise true.
			$item = $request->getVal( 'articleguidanceitem' );
			$value = ( $item !== null && preg_match( '/^Q\d+$/', $item ) ) ? $item : true;
			$editing = $session->get( EditTagHandler::SESSION_EDITING );
			$editing = is_array( $editing ) ? $editing : [];
			// Re-insert at the end so the most recently started edits survive the cap.
			unset( $editing[ $titleText ] );
			$editing[ $titleText ] = $value;
			$editing = array_slice( $editing, -EditTagHandler::MAX_TRACKED, null, true );
			$session->set( EditTagHandler::SESSION_EDITING, $editing );
			$this->sendEditingStartedEvent( $title, 'articleguidance' );
			return;
		}

		// Case 2: create a new article from a red link
		if ( $this->isArticleRedLink( $title, $request ) ) {
			if ( !$this->isUserAllowed( $user ) ) {
				return;
			}
			if ( !$this->isEditorInScope( $user ) ) {
				return;
			}
			if ( !$this->isRefererInScope( $request ) ) {
				return;
			}

			// Skip Article Guidance entirely for red links to deleted or moved-away
			// articles so the editor opens as usual, showing the deletion/move log
			// and (for those with permission) undelete tools. No entry_point or
			// editing_start event is sent for them. (T428146)
			if ( $this->hasDeletionOrMoveLog( $title ) ) {
				return;
			}

			$shouldRedirect = $this->isRedirectEnabled() && $this->hasArticleGuidanceEnabled( $user );
			$this->sendEntryPointEvent( 'redlink', $shouldRedirect );
			if ( $shouldRedirect ) {
				// Outcome 1: go to Article Guidance
				$this->performRedirect( $output, [
					'newarticletitle' => $title->getPrefixedText(),
					'source' => 'redlink',
				] );
				return false;
			} else {
				// Outcome 2: go directly to the editor
				$this->sendEditingStartedEvent( $title, 'redlink' );
				return;
			}
		}

		// Case 3: user lands on a configured entry point page (e.g. Special:ArticleWizard)
		if ( $this->isEntryPointPage( $title ) ) {
			if ( !$this->isUserAllowed( $user ) ) {
				return;
			}
			if ( !$this->isEditorInScope( $user ) ) {
				return;
			}

			$shouldRedirect = $this->isRedirectEnabled() && $this->hasArticleGuidanceEnabled( $user );
			$this->sendEntryPointEvent( 'articlewizard', $shouldRedirect );
			if ( $shouldRedirect ) {
				// Outcome 1: go to Article Guidance
				$this->performRedirect( $output, [
					'source' => 'articlewizard',
				] );
				return false;
			} else {
				// Outcome 2: stay on the entry point page
				// TODO: log something here when we have the ability to tag articles created
				// after going through the article wizard.
			}
		}
	}
}
