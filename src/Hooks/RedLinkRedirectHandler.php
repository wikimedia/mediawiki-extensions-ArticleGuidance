<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Actions\ActionEntryPoint;
use MediaWiki\Config\Config;
use MediaWiki\EditPage\EditPage;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
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
	 * @return bool True if should redirect
	 */
	private function shouldRedirect( Title $title, WebRequest $request ): bool {
		if ( !$this->isArticleRedLink( $title, $request ) ) {
			return false;
		}

		return $this->isInScope( $request );
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
	private function isInScope( WebRequest $request ): bool {
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
	 * Perform redirect to Special:NewArticle
	 *
	 * @param Title $title
	 * @param OutputPage $output
	 * @return void
	 */
	private function performRedirect( Title $title, OutputPage $output ): void {
		$specialPage = SpecialPage::getTitleFor( 'NewArticle' );
		if ( $specialPage ) {
			$output->redirect( $specialPage->getFullURL( [ 'newarticletitle' => $title->getText() ] ) );
		}
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
		if ( $this->shouldRedirect( $title, $request ) ) {
			$this->performRedirect( $title, $output );
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

		if ( $this->shouldRedirect( $title, $request ) ) {
			$this->performRedirect( $title, $context->getOutput() );
			return false;
		}

		return true;
	}
}
