<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

/**
 * Builds Wikimedia Commons thumbnail URLs. Mirrors the JS utils/commonsThumb.js helper.
 */
class CommonsThumb {

	private const THUMB_WIDTH = 60;

	/**
	 * Convert a Wikimedia Commons image filename to a thumbnail URL
	 *
	 * @param string $filename Image filename from Wikidata
	 * @return string Thumbnail URL
	 */
	public function getUrl( string $filename ): string {
		// Replace spaces with underscores
		$filename = str_replace( ' ', '_', $filename );

		// Create MD5 hash for directory structure
		$md5 = md5( $filename );
		$dir1 = substr( $md5, 0, 1 );
		$dir2 = substr( $md5, 0, 2 );

		// Commons renders SVG thumbnails as PNG
		$suffix = preg_match( '/\.svg$/i', $filename ) ? '.png' : '';

		// Build Commons thumbnail URL
		return sprintf(
			'https://thumb.wikimedia.org/wikipedia/commons/thumb/%s/%s/%s/%dpx-%s%s',
			$dir1,
			$dir2,
			rawurlencode( $filename ),
			self::THUMB_WIDTH,
			rawurlencode( $filename ),
			$suffix
		);
	}
}
