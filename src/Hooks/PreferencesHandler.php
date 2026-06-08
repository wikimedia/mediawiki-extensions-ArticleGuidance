<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Preferences\Hook\GetPreferencesHook;

class PreferencesHandler implements GetPreferencesHook {

	public function __construct(
		private readonly ArticleGuidanceExperimentFactory $experimentFactory,
	) {
	}

	/**
	 * @inheritDoc
	 */
	public function onGetPreferences( $user, &$preferences ): void {
		$experiment = $this->experimentFactory->getExperiment();
		if ( $experiment === null || !$experiment->isAssignedGroup( 'treatment' ) ) {
			return;
		}

		$preferences['articleguidance-enable'] = [
			'type' => 'toggle',
			'label-message' => 'articleguidance-pref-enable-label',
			'help-message' => 'articleguidance-pref-enable-help',
			'section' => 'editing/advancedediting',
		];
	}
}
