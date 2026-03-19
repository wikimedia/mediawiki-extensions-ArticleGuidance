<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Http\HttpRequestFactory;

/**
 * Fetches reachability and title metadata from an arbitrary URL.
 */
class PageMetadataFetcher {

	public function __construct(
		private readonly HttpRequestFactory $httpRequestFactory,
	) {
	}

	/**
	 * Fetch metadata for a URL.
	 *
	 * Returns null if the URL resolves to a private/reserved IP or is unreachable.
	 * Otherwise returns an array with the page title (or null if not extractable).
	 *
	 * @param string $url
	 * @return array|null null if unreachable
	 */
	public function fetch( string $url ): ?array {
		if ( !$this->resolvesToPublicIp( $url ) ) {
			return null;
		}

		$request = $this->httpRequestFactory->create( $url, [
			'timeout' => 10,
			'followRedirects' => false,
		], __METHOD__ );
		$status = $request->execute();
		$httpCode = $request->getStatus();

		if ( $httpCode === 403 ) {
			return [
				'title' => $this->titleFromPath( $url ),
			];
		}

		if ( !$status->isOK() || $httpCode < 200 || $httpCode >= 300 ) {
			return null;
		}

		return [
			'title' => $this->extractTitle( $request->getContent() ),
		];
	}

	/**
	 * Check that the URL's hostname resolves to a public (non-private, non-reserved) IP address.
	 * Blocks SSRF attacks targeting localhost, RFC-1918 ranges, and link-local addresses
	 * such as the AWS instance metadata endpoint (169.254.169.254).
	 *
	 * Both IPv4 and IPv6 addresses are checked, including bare IP literals in the URL.
	 * Every resolved address must be public — a host that resolves to any private address is rejected.
	 *
	 * @param string $url
	 * @return bool
	 */
	private function resolvesToPublicIp( string $url ): bool {
		$host = parse_url( $url, PHP_URL_HOST );
		if ( !$host ) {
			return false;
		}

		// Strip IPv6 brackets (e.g. [::1] → ::1)
		$host = trim( $host, '[]' );

		// Collect all IPs: bare IP literals resolve to themselves,
		// hostnames are looked up via DNS for both A (IPv4) and AAAA (IPv6) records.
		if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
			$ips = [ $host ];
		} else {
			$records = dns_get_record( $host, DNS_A | DNS_AAAA );
			if ( !$records ) {
				return false;
			}
			$ips = array_map( static function ( $r ) {
				return $r['ip'] ?? $r['ipv6'] ?? null;
			}, $records );
			$ips = array_filter( $ips );
			if ( !$ips ) {
				return false;
			}
		}

		// Every resolved address must be public.
		foreach ( $ips as $ip ) {
			if ( !filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Derive a human-readable title from the last path segment of a URL.
	 * Used as a fallback when the page is blocked (403).
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
	 * Extract a page title from HTML, preferring og:title over <title>.
	 *
	 * @param string $html
	 * @return string|null
	 */
	private function extractTitle( string $html ): ?string {
		if ( $html === '' ) {
			return null;
		}

		$dom = new \DOMDocument();
		$prevErrors = libxml_use_internal_errors( true );
		$dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html, LIBXML_NOERROR );
		libxml_use_internal_errors( $prevErrors );
		$xpath = new \DOMXPath( $dom );

		// Try og:title first
		$nodes = $xpath->query( '//meta[@property="og:title"]/@content' );
		if ( $nodes && $nodes->length > 0 ) {
			$value = trim( $nodes->item( 0 )->nodeValue );
			if ( $value !== '' ) {
				return $value;
			}
		}

		// Fall back to <title>
		$nodes = $xpath->query( '//title' );
		if ( $nodes && $nodes->length > 0 ) {
			$value = trim( $nodes->item( 0 )->textContent );
			if ( $value !== '' ) {
				return $value;
			}
		}

		return null;
	}
}
