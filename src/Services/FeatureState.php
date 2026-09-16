<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Config\Config;

/**
 * Tells the rest of the extension if Article Guidance is available on this wiki.
 *
 * ArticleGuidanceEnabled is the switch for the whole user-facing feature. It comes
 * from the ArticleGuidanceConfig service, so a community can change it in Community
 * Configuration. It has precedence over the more specific settings: when it is false,
 * the wiki behaves as if Article Guidance were not enabled.
 *
 * Use this service for each decision about the availability of the feature, so that
 * the precedence rule stays in one place.
 */
class FeatureState {

	public function __construct(
		private readonly Config $config,
	) {
	}

	/**
	 * Is the feature available on this wiki?
	 */
	public function isEnabled(): bool {
		return (bool)$this->config->get( 'ArticleGuidanceEnabled' );
	}

	/**
	 * Does this wiki send eligible users from a red link to Article Guidance?
	 *
	 * The global switch has precedence, so a wiki with the feature off never redirects.
	 */
	public function isRedirectEnabled(): bool {
		return $this->isEnabled() && (bool)$this->config->get( 'ArticleGuidanceRedirectEnabled' );
	}
}
