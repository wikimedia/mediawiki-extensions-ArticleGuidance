<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Specials;

use SpecialPage;

class SpecialNewArticle extends SpecialPage {

	public function __construct() {
		parent::__construct( 'NewArticle', '', $listed = false );
	}

	/**
	 * @param string|null $subPage
	 */
	public function execute( $subPage ) {
		$this->setHeaders();
		$this->outputHeader();

		$out = $this->getOutput();
		$out->setPageTitle( $this->msg( 'articleguidance-specialnewarticle-title' )->text() );
		$out->addModules( 'ext.articleguidance.newarticle' );
		$out->addModuleStyles( [ 'ext.articleguidance.newarticle.styles' ] );
	}

	/**
	 * @return string
	 */
	protected function getGroupName() {
		return 'pages';
	}
}
