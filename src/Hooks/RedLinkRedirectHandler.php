<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Actions\ActionEntryPoint;
use MediaWiki\Config\Config;
use MediaWiki\EditPage\EditPage;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\TestKitchen\Sdk\ExperimentManagerInterface;
use MediaWiki\Hook\AlternateEditHook;
use MediaWiki\Hook\BeforeInitializeHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Request\WebRequest;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use MediaWiki\User\User;

class RedLinkRedirectHandler implements
	AlternateEditHook,
	BeforeInitializeHook
{

	public function __construct(
		private readonly TitleExtractor $titleExtractor,
		private readonly Config $mainConfig,
		private readonly TitleFactory $titleFactory,
		private readonly ?ExperimentManagerInterface $experimentManager = null,
	) {
	}

	/**
	 * Check if a title is a red-link article edit request.
	 *
	 * @param Title $title
	 * @param WebRequest $request
	 * @return bool
	 */
	private function isArticleRedLink( Title $title, WebRequest $request ): bool {
		return !$title->exists()
			&& $request->getVal( 'action' ) === 'edit'
			&& $request->getVal( 'redlink' ) === '1'
			&& $title->getNamespace() === NS_MAIN;
	}

	/**
	 * Check if we should redirect to Special:NewArticle
	 *
	 * @param Title $title
	 * @param WebRequest $request
	 * @param User $user
	 * @return bool True if should redirect
	 */
	private function shouldRedirect( Title $title, WebRequest $request, User $user ): bool {
		return $this->isArticleRedLink( $title, $request )
			&& $this->isUserInScope( $user )
			&& $this->isRefererInScope( $request )
			&& $this->isInTreatmentGroup();
	}

	/**
	 * Check whether the user is in the experiment treatment group, or whether
	 * traffic splitting is disabled (no experiment configured or TestKitchen unavailable).
	 *
	 * @return bool
	 */
	private function isInTreatmentGroup(): bool {
		$experimentName = $this->mainConfig->get( 'ArticleGuidanceExperimentName' );
		if ( $this->experimentManager === null || $experimentName === '' ) {
			return false;
		}

		return $this->experimentManager
			->getExperiment( $experimentName )
			->isAssignedGroup( 'treatment' );
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
	 * Check whether the request's referer page is within the configured experiment scope.
	 *
	 * Category names in config are bare (without namespace prefix) and compared against
	 * DB keys so matching works regardless of the wiki's content language.
	 *
	 * @param WebRequest $request
	 * @return bool
	 */
	private function isRefererInScope( WebRequest $request ): bool {
		$refererTitles = $this->mainConfig->get( 'ArticleGuidanceExperimentRefererTitles' );
		$refererCategories = $this->mainConfig->get( 'ArticleGuidanceExperimentRefererCategories' );

		if ( !is_array( $refererTitles ) || !is_array( $refererCategories ) ) {
			return false;
		}

		$refererTitles = array_filter( $refererTitles, 'is_string' );
		$refererCategories = array_filter( $refererCategories, 'is_string' );

		// Empty scope lists mean all pages are in scope
		if ( $refererTitles === [] && $refererCategories === [] ) {
			return true;
		}

		$refTitle = $this->getRefererTitle( $request );
		if ( $refTitle === null ) {
			return false;
		}

		// Check title scope — normalize via DB key to handle spaces/underscores and namespace aliases
		if ( $refererTitles !== [] ) {
			$refererDBKey = $refTitle->getPrefixedDBkey();
			foreach ( $refererTitles as $configuredTitle ) {
				$configTitle = $this->titleFactory->newFromText( $configuredTitle );
				if ( $configTitle !== null && $configTitle->getPrefixedDBkey() === $refererDBKey ) {
					return true;
				}
			}
		}

		// Check category scope (DB query, only if needed)
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
	 * Check whether the user is within the experiment's target audience.
	 *
	 * The user must be logged in, have fewer edits than the configured junior editor
	 * threshold, not be blocked, and have permission to create pages on this wiki.
	 *
	 * @param User $user
	 * @return bool
	 */
	private function isUserInScope( User $user ): bool {
		$juniorThreshold = $this->mainConfig->get( 'ArticleGuidanceJuniorEditorThreshold' );
		return $user->isRegistered()
			&& $user->getEditCount() < $juniorThreshold
			&& $user->getBlock() === null
			&& $user->isAllowed( 'createpage' );
	}

	/**
	 * Perform redirect to Special:NewArticle
	 *
	 * @param Title|null $title When non-null, pre-fills the newarticletitle param.
	 * @param OutputPage $output
	 * @return void
	 */
	private function performRedirect( ?Title $title, OutputPage $output ): void {
		$specialPage = SpecialPage::getTitleFor( 'NewArticle' );
		if ( $specialPage ) {
			$params = $title !== null ? [ 'newarticletitle' => $title->getText() ] : [];
			$output->redirect( $specialPage->getFullURL( $params ) );
		}
	}

	/**
	 * Check whether the current page is a configured entry-point title.
	 *
	 * @param Title $title
	 * @return bool
	 */
	private function isEntryPointPage( Title $title ): bool {
		$entryPointTitles = $this->mainConfig->get( 'ArticleGuidanceExperimentEntryPointTitles' );
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
	 * Check if we should redirect from an entry-point page to Special:NewArticle.
	 *
	 * @param Title $title
	 * @param User $user
	 * @return bool
	 */
	private function shouldRedirectFromEntryPoint( Title $title, User $user ): bool {
		return $this->isEntryPointPage( $title )
			&& $this->isUserInScope( $user )
			&& $this->isInTreatmentGroup();
	}

	/**
	 * BeforeInitialize hook - catches requests early, works on mobile
	 *
	 * @param Title $title
	 * @param null $unused
	 * @param OutputPage $output
	 * @param User $user
	 * @param WebRequest $request
	 * @param ActionEntryPoint $mediaWikiEntryPoint
	 * @return bool|void
	 */
	public function onBeforeInitialize( $title, $unused, $output, $user, $request, $mediaWikiEntryPoint ) {
		if ( $title === null ) {
			return;
		}
		if ( $this->shouldRedirect( $title, $request, $user ) ) {
			$this->performRedirect( $title, $output );
			return false;
		}
		if ( $this->shouldRedirectFromEntryPoint( $title, $user ) ) {
			$this->performRedirect( null, $output );
			return false;
		}
	}

	/**
	 * Redirect red link edit attempts to Special:NewArticle (desktop fallback)
	 *
	 * @param EditPage $editPage
	 * @return bool
	 */
	public function onAlternateEdit( $editPage ) {
		$title = $editPage->getTitle();
		$context = $editPage->getContext();
		$request = $context->getRequest();
		$user = $context->getUser();

		if ( $this->shouldRedirect( $title, $request, $user ) ) {
			$this->performRedirect( $title, $context->getOutput() );
			return false;
		}

		return true;
	}
}
