<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Actions\ActionEntryPoint;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Output\OutputPage;
use MediaWiki\Page\Article;
use MediaWiki\Request\WebRequest;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Title\Title;
use MediaWiki\User\User;

class RedLinkRedirectHandler {

	public function __construct(
		private readonly TitleExtractor $titleExtractor,
	) {
	}

	/**
	 * Check if we should redirect to Special:NewArticle
	 *
	 * @param Title $title
	 * @param WebRequest $request
	 * @return bool True if should redirect
	 */
	private function shouldRedirect( Title $title, $request ): bool {
		// Only redirect if the page doesn't exist and we're trying to edit
		if ( !$title->exists() &&
			$request->getVal( 'action' ) === 'edit' &&
			$request->getVal( 'redlink' ) === '1' &&
			$title->getNamespace() === NS_MAIN
		) {
			// $referer = $request->getHeader( 'Referer' );
			// $refererTitle = $this->titleExtractor->extractPageTitle( $referer );
			// todo: conditional based on refererTitle
			return true;
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
	private function performRedirect( Title $title, $output ): void {
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
		if ( $this->shouldRedirect( $title, $request ) ) {
			$this->performRedirect( $title, $output );
			return false;
		}
	}

	/**
	 * Redirect red link edit attempts to Special:NewArticle (desktop fallback)
	 *
	 * @param Article $article
	 * @return bool
	 */
	public function onAlternateEdit( $article ) {
		$title = $article->getTitle();
		$context = RequestContext::getMain();
		$request = $context->getRequest();

		if ( $this->shouldRedirect( $title, $request ) ) {
			$this->performRedirect( $title, $context->getOutput() );
			return false;
		}

		return true;
	}
}
