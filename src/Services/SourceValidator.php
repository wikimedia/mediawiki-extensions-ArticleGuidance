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
		private readonly OutlineService $outlineService,
	) {
	}

	/**
	 * Validate a URL and return a result array with domain, classification, and title.
	 *
	 * @param string $url
	 * @param string|null $outlineQId Q-ID of the selected outline, for domain classification
	 * @return array{domain: string, classification: string, title: string|null}
	 */
	public function validate( string $url, ?string $outlineQId = null ): array {
		$domain = strtolower( preg_replace( '/^www\./i', '', parse_url( $url, PHP_URL_HOST ) ?? '' ) );

		if ( $this->spamBlacklist !== null ) {
			$matches = $this->spamBlacklist->filter(
				[ $url ], null, $this->userFactory->newAnonymous(), true
			);
			if ( $matches !== false ) {
				return [
					'domain' => $domain,
					'classification' => 'spam',
					'title' => null,
				];
			}
		}

		return [
			'domain' => $domain,
			'classification' => $this->classifyDomain( $domain, $outlineQId ),
			'title' => $this->titleFromPath( $url ),
		];
	}

	/**
	 * Derive a human-readable title from the last path segment of a URL.
	 * e.g. "/posts/my-article-slug" → "My article slug"
	 *
	 * @param string $url
	 * @return string|null
	 */
	private function titleFromPath( string $url ): ?string {
		$path = parse_url( $url, PHP_URL_PATH ) ?? '';
		$slug = basename( $path );
		if ( $slug === '' ) {
			return null;
		}
		return ucfirst( str_replace( [ '-', '_' ], ' ', $slug ) );
	}

	/**
	 * @param string $domain
	 * @param string|null $outlineQId
	 * @return string 'recommended', 'discouraged', or 'neutral'
	 */
	private function classifyDomain( string $domain, ?string $outlineQId ): string {
		if ( $outlineQId === null ) {
			return 'neutral';
		}
		$outline = $this->outlineService->getOutlineByQId( $outlineQId );
		if ( $outline === null ) {
			return 'neutral';
		}
		$recommendedUrls = $outline['recommendedSources']['urls'] ?? [];
		$discouragedUrls = $outline['discouragedSources']['urls'] ?? [];
		if ( $this->domainMatches( $domain, $recommendedUrls ) ) {
			return 'recommended';
		}
		if ( $this->domainMatches( $domain, $discouragedUrls ) ) {
			return 'discouraged';
		}
		return 'neutral';
	}

	/**
	 * @param string $domain
	 * @param string[] $allowedDomains
	 * @return bool
	 */
	private function domainMatches( string $domain, array $allowedDomains ): bool {
		foreach ( $allowedDomains as $allowed ) {
			if ( $domain === $allowed || str_ends_with( $domain, '.' . $allowed ) ) {
				return true;
			}
		}
		return false;
	}
}
