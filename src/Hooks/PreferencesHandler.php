<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Preferences\Hook\GetPreferencesHook;

class PreferencesHandler implements GetPreferencesHook {

	public function __construct(
		private readonly Config $mainConfig,
	) {
	}

	/**
	 * @inheritDoc
	 */
	public function onGetPreferences( $user, &$preferences ): void {
		// Show the opt-out only on wikis where the redirect can happen.
		if ( !$this->mainConfig->get( 'ArticleGuidanceRedirectEnabled' ) ) {
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
