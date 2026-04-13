<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

/**
 * Encodes URLs to ASCII so that filter_var( FILTER_VALIDATE_URL ) accepts them.
 */
class UrlAsciiEncoder {

	/**
	 * Encode a URL to ASCII so that filter_var( FILTER_VALIDATE_URL ) accepts it.
	 *
	 * Two transformations are applied:
	 *  1. IDN hostname → punycode via idn_to_ascii(), so non-ASCII labels such as
	 *     "bücher" or "ουτοπία" become their xn-- equivalents.
	 *  2. Non-ASCII bytes in the path, query, and fragment are percent-encoded so
	 *     URLs like https://ja.wikipedia.org/wiki/東京 pass filter_var().
	 *     Sequences that are already percent-encoded are left untouched.
	 *
	 * @param string $url
	 * @return string
	 */
	public function encode( string $url ): string {
		$parts = parse_url( $url );
		if ( $parts === false ) {
			return $url;
		}

		// 1. Convert IDN hostname to punycode.
		if ( isset( $parts['host'] ) ) {
			$host = trim( $parts['host'], '[]' );
			$ascii = idn_to_ascii( $host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46 );
			if ( $ascii !== false ) {
				$parts['host'] = $ascii;
			}
		}

		// 2. Percent-encode non-ASCII bytes in path, query, and fragment.
		foreach ( [ 'path', 'query', 'fragment' ] as $key ) {
			if ( isset( $parts[ $key ] ) ) {
				$parts[ $key ] = preg_replace_callback(
					'/[^\x00-\x7F]+/',
					static fn ( $m ) => rawurlencode( $m[0] ),
					(string)$parts[ $key ]
				) ?? $parts[ $key ];
			}
		}

		return $this->buildUrl( $parts );
	}

	/**
	 * Reconstruct a URL string from the array returned by parse_url().
	 *
	 * @param array $parts
	 * @return string
	 */
	private function buildUrl( array $parts ): string {
		$url = '';

		if ( isset( $parts['scheme'] ) ) {
			$url .= $parts['scheme'] . '://';
		}

		if ( isset( $parts['user'] ) ) {
			$url .= $parts['user'];
			if ( isset( $parts['pass'] ) ) {
				$url .= ':' . $parts['pass'];
			}
			$url .= '@';
		}

		if ( isset( $parts['host'] ) ) {
			$url .= $parts['host'];
		}

		if ( isset( $parts['port'] ) ) {
			$url .= ':' . $parts['port'];
		}

		$url .= $parts['path'] ?? '';

		if ( isset( $parts['query'] ) ) {
			$url .= '?' . $parts['query'];
		}

		if ( isset( $parts['fragment'] ) ) {
			$url .= '#' . $parts['fragment'];
		}

		return $url;
	}
}
