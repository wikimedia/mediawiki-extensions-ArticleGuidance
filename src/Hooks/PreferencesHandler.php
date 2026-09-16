<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWiki\Preferences\Hook\GetPreferencesHook;

class PreferencesHandler implements GetPreferencesHook {

	public function __construct(
		private readonly FeatureState $featureState,
	) {
	}

	/**
	 * @inheritDoc
	 */
	public function onGetPreferences( $user, &$preferences ): void {
		// Show the opt-out only on wikis where the redirect can happen.
		if ( !$this->featureState->isRedirectEnabled() ) {
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
