<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Extension\SpamBlacklist\SpamBlacklist;
use MediaWiki\User\UserFactory;

/**
 * Service for validating article sources.
 */
class SourceValidator {

	public function __construct(
		private readonly ?SpamBlacklist $spamBlacklist,
		private readonly UserFactory $userFactory,
	) {
	}

	/**
	 * Validate a URL and return a result array with reliable, domain, and reason.
	 *
	 * @param string $url
	 * @return array{reliable: bool, domain: string, reason: ?string}
	 */
	public function validate( string $url ): array {
		$domain = strtolower( preg_replace( '/^www\./i', '', parse_url( $url, PHP_URL_HOST ) ?? '' ) );

		if ( $this->spamBlacklist !== null ) {
			$matches = $this->spamBlacklist->filter(
				[ $url ], null, $this->userFactory->newAnonymous(), true
			);
			if ( $matches !== false ) {
				return [
					'reliable' => false,
					'domain' => $domain,
					'reason' => 'blocklisted',
				];
			}
		}

		return [
			'reliable' => true,
			'domain' => $domain,
			'reason' => null,
		];
	}
}
