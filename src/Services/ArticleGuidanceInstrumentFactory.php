<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Config\Config;
use MediaWiki\Extension\TestKitchen\Sdk\InstrumentInterface;
use MediaWiki\Extension\TestKitchen\Sdk\InstrumentManagerInterface;

class ArticleGuidanceInstrumentFactory {

	public function __construct(
		private readonly Config $mainConfig,
		private readonly ?InstrumentManagerInterface $instrumentManager,
	) {
	}

	public function getInstrument(): ?InstrumentInterface {
		$instrumentName = $this->mainConfig->get( 'ArticleGuidanceInstrumentName' );
		if ( $this->instrumentManager === null || $instrumentName === '' ) {
			return null;
		}
		return $this->instrumentManager->getInstrument( $instrumentName );
	}
}
