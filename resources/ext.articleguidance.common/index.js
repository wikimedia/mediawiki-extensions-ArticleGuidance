/**
 * Code that the Article Guidance modules share.
 */

const { buildApiUrl, getPageUrl, buildSparqlUrl } = require( './wikidata.js' );
const { fetchOutlines } = require( './outlines.js' );

module.exports = {
	buildApiUrl,
	getPageUrl,
	buildSparqlUrl,
	fetchOutlines
};
