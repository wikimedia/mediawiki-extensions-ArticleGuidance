<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Hook\BeforeInitializeHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Request\WebRequest;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use MediaWiki\User\Options\UserOptionsLookup;
use MediaWiki\User\User;

class RedLinkRedirectHandler implements BeforeInitializeHook {

	public function __construct(
		private readonly TitleExtractor $titleExtractor,
		private readonly Config $mainConfig,
		private readonly TitleFactory $titleFactory,
		private readonly ArticleGuidanceExperimentFactory $experimentFactory,
		private readonly UserOptionsLookup $userOptionsLookup,
	) {
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
	 * Check whether the user is in the experiment treatment group, or whether
	 * traffic splitting is disabled (no experiment configured or TestKitchen unavailable).
	 *
	 * @return bool
	 */
	private function isInTreatmentGroup(): bool {
		$experiment = $this->experimentFactory->getExperiment();
		if ( $experiment === null ) {
			return false;
		}
		return $experiment->isAssignedGroup( 'treatment' );
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
	 * Title matching normalises both sides to DB keys to handle spaces/underscores and namespace
	 * aliases. Category matching performs a DB query and only runs when the title list produces
	 * no match. If both lists are empty, all referers are considered in scope.
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
	 * Check whether the user is within the experiment's target audience.
	 *
	 * @param User $user
	 * @return bool
	 */
	private function isUserAllowed( User $user ): bool {
		if ( !$user->isAllowed( 'createpage' ) || $user->getBlock() !== null ) {
			return false;
		}
		if ( $this->mainConfig->get( 'ArticleGuidanceExperimentJuniorEditorsOnly' ) ) {
			$threshold = $this->mainConfig->get( 'ArticleGuidanceJuniorEditorThreshold' );
			$editCount = $user->getEditCount() ?? 0;
			if ( $editCount >= $threshold ) {
				return false;
			}
		}
		return true;
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

	private function sendExperimentExposure(): void {
		$experiment = $this->experimentFactory->getExperiment();
		if ( $experiment !== null ) {
			$experiment->sendExposure();
		}
	}

	private function sendEditingStartedEvent( Title $title ): void {
		$experiment = $this->experimentFactory->getExperiment();
		if ( $experiment !== null ) {
			$experiment->send( 'editing_start', [
				'page' => [
					'title' => $title->getPrefixedText(),
				]
			] );
		}
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
			$request->getSession()->set( EditTagHandler::SESSION_EDITING, $title->getPrefixedText() );
			$this->sendEditingStartedEvent( $title );
			return;
		}

		// Case 2: create a new article from a red link
		if ( $this->isArticleRedLink( $title, $request )
			&& $this->isRefererInScope( $request )
			&& $this->isUserAllowed( $user )
		) {
			$this->sendExperimentExposure();
			if ( $this->isInTreatmentGroup() && $this->hasArticleGuidanceEnabled( $user ) ) {
				// Outcome 1: go to Article Guidance
				$this->performRedirect( $output, [
					'newarticletitle' => $title->getPrefixedText(),
					'source' => 'redlink',
				] );
				return false;
			} else {
				// Outcome 2: go directly to the editor
				$this->sendEditingStartedEvent( $title );
				return;
			}
		}

		// Case 3: user lands on a configured entry point page (e.g. Special:ArticleWizard)
		if ( $this->isEntryPointPage( $title )
			&& $this->isUserAllowed( $user )
		) {
			$this->sendExperimentExposure();
			if ( $this->isInTreatmentGroup() && $this->hasArticleGuidanceEnabled( $user ) ) {
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
