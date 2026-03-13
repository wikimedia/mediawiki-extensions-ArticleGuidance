<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

/**
 * Service for validating article sources.
 */
class SourceValidator {

	private const UNRELIABLE_DOMAINS = [
		// Social media
		'facebook.com',
		'fb.com',
		'twitter.com',
		'x.com',
		'instagram.com',
		'tiktok.com',
		'linkedin.com',
		'reddit.com',
		'tumblr.com',
		'pinterest.com',
		'snapchat.com',
		// AI/Generated content
		'chatgpt.com',
		'openai.com',
		'claude.ai',
		'google.com',
		'character.ai',
		// User-generated content platforms
		'medium.com',
		'substack.com',
		'wordpress.com',
		'blogger.com',
		'wix.com',
		'youtube.com',
		'youtu.be',
	];

	/**
	 * Validate a URL and return a result array with reliable, domain, and reason.
	 *
	 * @param string $url
	 * @return array{reliable: bool, domain: string, reason: ?string}
	 */
	public function validate( string $url ): array {
		$domain = strtolower( preg_replace( '/^www\./i', '', parse_url( $url, PHP_URL_HOST ) ?? '' ) );

		foreach ( self::UNRELIABLE_DOMAINS as $bad ) {
			if ( $domain === $bad || str_ends_with( $domain, '.' . $bad ) ) {
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
