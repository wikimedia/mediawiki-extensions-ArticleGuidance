<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

class TitleExtractor {

	/**
	 * Extract the page title from a MediaWiki URL.
	 *
	 * Handles both pretty URLs (/wiki/Article_Title) and
	 * script URLs (/w/index.php?title=Article_Title).
	 *
	 * @param string $url The URL to parse
	 * @return string|null The page title, or null if not found
	 */
	public function extractPageTitle( string $url ): ?string {
		$parsed = parse_url( $url );
		if ( $parsed === false || empty( $parsed['path'] ) ) {
			return null;
		}

		// Check for pretty URL pattern: /wiki/<title>
		if ( preg_match( '#/wiki/(.+)$#', $parsed['path'], $matches ) ) {
			return rawurldecode( $matches[1] );
		}

		// Check for script URL pattern: ?title=<title>
		if ( isset( $parsed['query'] ) ) {
			parse_str( $parsed['query'], $params );
			if ( isset( $params['title'] ) && $params['title'] !== '' ) {
				return $params['title'];
			}
		}

		return null;
	}
}
