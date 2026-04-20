<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Config\Config;
use MediaWiki\Extension\TestKitchen\Sdk\ExperimentInterface;
use MediaWiki\Extension\TestKitchen\Sdk\ExperimentManagerInterface;

class ArticleGuidanceExperimentFactory {

	public function __construct(
		private readonly Config $mainConfig,
		private readonly ?ExperimentManagerInterface $experimentManager,
	) {
	}

	public function getExperiment(): ?ExperimentInterface {
		$experimentName = $this->mainConfig->get( 'ArticleGuidanceExperimentName' );
		if ( $this->experimentManager === null || $experimentName === '' ) {
			return null;
		}
		return $this->experimentManager->getExperiment( $experimentName );
	}
}
