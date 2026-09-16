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
		private readonly FeatureState $featureState,
	) {
	}

	/**
	 * Get the instrument that sends the Article Guidance events.
	 *
	 * Returns null when the wiki does not have the feature, so that a wiki with
	 * Article Guidance off sends no event at all.
	 */
	public function getInstrument(): ?InstrumentInterface {
		$instrumentName = $this->mainConfig->get( 'ArticleGuidanceInstrumentName' );
		if (
			$this->instrumentManager === null
			|| $instrumentName === ''
			|| !$this->featureState->isEnabled()
		) {
			return null;
		}
		return $this->instrumentManager->getInstrument( $instrumentName );
	}
}
