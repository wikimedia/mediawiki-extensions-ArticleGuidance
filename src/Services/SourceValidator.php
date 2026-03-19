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
		private readonly PageMetadataFetcher $pageMetadataFetcher,
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

		// Unreachable URLs are accepted as neutral sources: we do not want to block editors
		// from citing a URL just because our server cannot reach it (firewall rules, geo-blocking,
		// paywalls that reject server-side requests, etc.). The title will be absent.
		$metadata = $this->pageMetadataFetcher->fetch( $url );
		if ( $metadata === null ) {
			return [
				'domain' => $domain,
				'classification' => 'neutral',
				'title' => null,
			];
		}

		return [
			'domain' => $domain,
			'classification' => $this->classifyDomain( $domain, $outlineQId ),
			'title' => $metadata['title'],
		];
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
