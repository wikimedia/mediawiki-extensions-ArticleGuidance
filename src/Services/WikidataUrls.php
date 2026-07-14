<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

/**
 * Single source of truth for building Wikidata URLs from the
 * ArticleGuidanceWikidataUrls config. Mirrors the JS utils/wikidata.js helper.
 */
class WikidataUrls {

	/**
	 * @param array $urls The ArticleGuidanceWikidataUrls config, with 'api', 'view'
	 *   and 'sparql' keys.
	 */
	public function __construct(
		private readonly array $urls,
	) {
	}

	/**
	 * Build an Action API request URL.
	 *
	 * @param array $params Query parameters (empty for the bare endpoint)
	 * @return string
	 */
	public function getApiUrl( array $params = [] ): string {
		return $this->withQuery( $this->urls['api'], $params );
	}

	/**
	 * Build a link to a Wikidata wiki page (an item or a special page).
	 *
	 * @param string $pageName Page title, e.g. 'Q42'
	 * @return string
	 */
	public function getPageUrl( string $pageName ): string {
		return str_replace( '$1', $pageName, $this->urls['view'] );
	}

	/**
	 * Build a SPARQL query request URL.
	 *
	 * @param array $params Query parameters (empty for the bare endpoint)
	 * @return string
	 */
	public function getSparqlUrl( array $params = [] ): string {
		return $this->withQuery( $this->urls['sparql'], $params );
	}

	/**
	 * @param string $base
	 * @param array $params
	 * @return string
	 */
	private function withQuery( string $base, array $params ): string {
		if ( $params === [] ) {
			return $base;
		}
		return $base . '?' . http_build_query( $params );
	}
}
