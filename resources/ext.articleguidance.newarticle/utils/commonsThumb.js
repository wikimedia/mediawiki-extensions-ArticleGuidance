const { md5 } = require( './md5.js' );

/**
 * Convert a Wikimedia Commons image filename to a thumbnail URL.
 *
 * Replicates the PHP WikidataInfoFetcher::getCommonsImageUrl() logic client-side,
 * using the same MD5-based directory path that Wikimedia's file storage uses.
 *
 * @param {string} filename Image filename from a Wikidata P18 claim
 * @param {number} [width=200] Thumbnail width in pixels
 * @return {string} Thumbnail URL
 */
function getCommonsThumbUrl( filename, width ) {
	const w = width || 200;
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
		dir1 + '/' + dir2 + '/' + encoded + '/' + w + 'px-' + encoded;
}

module.exports = { getCommonsThumbUrl };
