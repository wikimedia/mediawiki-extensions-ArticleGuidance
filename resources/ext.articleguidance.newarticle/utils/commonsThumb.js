const { md5 } = require( './md5.js' );

/**
 * 60 is one of the officially supported thumbnail size.
 * See https://www.mediawiki.org/wiki/Common_thumbnail_sizes
 * Is it important to use a standard size to avoid causing
 * extra load on the infrastructure.
 * The thumb is displayed as 48x46 so 60 makes sense.
 */
const THUMB_WIDTH = 60;

/**
 * Convert a Wikimedia Commons image filename to a thumbnail URL.
 *
 * Replicates the PHP WikidataInfoFetcher::getCommonsImageUrl() logic client-side,
 * using the same MD5-based directory path that Wikimedia's file storage uses.
 *
 * @param {string} filename Image filename from a Wikidata P18 claim
 * @return {string} Thumbnail URL
 */
function getCommonsThumbUrl( filename ) {
	const normalized = filename.replace( / /g, '_' );
	const bytes = new TextEncoder().encode( normalized );
	const hash = md5( bytes );
	const dir1 = hash[ 0 ];
	const dir2 = hash.slice( 0, 2 );
	const encoded = encodeURIComponent( normalized )
		.replace( /!/g, '%21' )
		.replace( /'/g, '%27' )
		.replace( /\(/g, '%28' )
		.replace( /\)/g, '%29' )
		.replace( /\*/g, '%2A' );
	return 'https://upload.wikimedia.org/wikipedia/commons/thumb/' +
		dir1 + '/' + dir2 + '/' + encoded + '/' + THUMB_WIDTH + 'px-' + encoded;
}

module.exports = { getCommonsThumbUrl };
