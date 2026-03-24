<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Specials;

use MediaWiki\Config\Config;
use MediaWiki\Language\Language;
use MediaWiki\SpecialPage\UnlistedSpecialPage;

class SpecialNewArticle extends UnlistedSpecialPage {

	public function __construct(
		private readonly Language $contentLanguage,
		private readonly Config $config,
	) {
		parent::__construct( 'NewArticle' );
	}

	/**
	 * @param string|null $subPage
	 */
	public function execute( $subPage ) {
		$this->setHeaders();
		$this->outputHeader();

		$out = $this->getOutput();
		$out->setPageTitle( $this->msg( 'articleguidance-specialnewarticle-title' )->text() );
		$out->addJsConfigVars( 'wgArticleGuidanceDraftTitlePrefix', $this->getDraftTitlePrefix() );
		$out->addJsConfigVars(
			'wgArticleGuidanceJuniorEditorThreshold',
			$this->config->get( 'ArticleGuidanceJuniorEditorThreshold' )
		);
		$out->addJsConfigVars(
			'wgArticleGuidanceCrossWikiThreshold',
			$this->config->get( 'ArticleGuidanceCrossWikiThreshold' )
		);
		$out->addJsConfigVars(
			'wgArticleGuidanceSourcesThreshold',
			$this->config->get( 'ArticleGuidanceSourcesThreshold' )
		);
		$out->addModules( 'ext.articleguidance.newarticle' );
		$out->addModuleStyles( [ 'ext.articleguidance.newarticle.styles' ] );
	}

	/**
	 * Build the prefix that goes before the article title when creating a draft.
	 *
	 * Uses the Draft namespace (ID 118) when the wiki defines one.
	 * Falls back to a sub-page of the current user's namespace (ID 2),
	 * using the SandboxLink subpage name when that extension is present.
	 *
	 * @return string e.g. "Draft:" or "User:Alice/Drafts/"
	 */
	private function getDraftTitlePrefix(): string {
		$draftNsText = $this->contentLanguage->getNsText( 118 );
		if ( $draftNsText !== false ) {
			return $draftNsText . ':';
		}
		$userNsText = $this->contentLanguage->getNsText( NS_USER );
		$sandboxMsg = $this->msg( 'sandboxlink-subpage-name' );
		$subpage = $sandboxMsg->exists() ? $sandboxMsg->plain() : 'Drafts';
		return $userNsText . ':' . $this->getUser()->getName() . '/' . $subpage . '/';
	}

	/**
	 * @return string
	 */
	protected function getGroupName() {
		return 'pages';
	}
}
