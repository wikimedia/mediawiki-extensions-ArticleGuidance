/**
 * Wikidata URL helpers. Every Wikidata URL is derived from the single
 * ArticleGuidanceWikidataUrls config (api / view / sparql), so the target wiki
 * (production, beta, test) is configured in one place. Mirrors the PHP
 * WikidataUrls value object.
 */

const urls = require( '../config.json' ).ArticleGuidanceWikidataUrls;

/**
 * Build a Wikidata Action API request URL, with the cross-origin defaults
 * (format=json, origin=*) that every client-side read needs.
 *
 * @param {Object} params Query parameters
 * @return {string}
 */
function buildApiUrl( params ) {
	const query = Object.assign( { format: 'json', origin: '*' }, params );
	return urls.api + '?' + new URLSearchParams( query );
}

/**
 * Build a link to a Wikidata wiki page (an item or a special page).
 *
 * @param {string} pageName Page title, e.g. 'Q42' or 'Special:NewItem'
 * @return {string}
 */
function getPageUrl( pageName ) {
	return urls.view.replace( '$1', pageName );
}

/**
 * Build a Wikidata SPARQL query request URL.
 *
 * @param {Object} params Query parameters
 * @return {string}
 */
function buildSparqlUrl( params ) {
	return urls.sparql + '?' + new URLSearchParams( params );
}

module.exports = {
	buildApiUrl,
	getPageUrl,
	buildSparqlUrl
};
