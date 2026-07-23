/**
 * Find example articles for an outline draft, and save an empty outline when no
 * draft can be generated.
 */

const { fetchOutlines } = require( 'ext.articleguidance.common' );
const { saveDraft } = require( './api/Outlines.js' );
const { findExampleArticles } = require( './articleFinder.js' );
const { toTypeEntries } = require( './outlineMapping.js' );

/**
 * Find example articles for each type, and share the examples between the types.
 *
 * @param {Array<{id: string, matchVia: (string|null), hierarchyDepth: number}>} types
 *   Article types of the outline
 * @param {number} limit Maximum number of articles for all the types together
 * @return {Promise<Array>} Example articles
 */
async function findExamples( types, limit ) {
	const competitors = toTypeEntries( await fetchOutlines() );
	const perType = Math.ceil( limit / types.length );
	const found = await Promise.all( types.map( ( type ) => findExampleArticles(
		type.id,
		type.matchVia,
		type.hierarchyDepth,
		competitors,
		perType
	) ) );

	const seen = new Set();
	return found.reduce( ( all, articles ) => all.concat( articles ), [] )
		.filter( ( article ) => {
			if ( seen.has( article.title ) ) {
				return false;
			}
			seen.add( article.title );
			return true;
		} )
		.slice( 0, limit );
}

/**
 * Save an outline with no content, for when no draft could be generated.
 * Mirrors OutlinePreloadHandler::buildSkeleton().
 *
 * @param {string[]} qIds Article types of the outline. The first is the primary type.
 * @return {Promise} Resolves when the draft is kept
 */
function saveEmptyDraft( qIds ) {
	const text = [
		'<article-guidance article-type="' + qIds.join( ' ' ) + '">',
		'',
		'<instructions>',
		'</instructions>',
		'',
		'<recommended-sources>',
		'</recommended-sources>',
		'',
		'<discouraged-sources>',
		'</discouraged-sources>',
		'',
		'</article-guidance>',
		''
	].join( '\n' );
	return saveDraft( qIds, text );
}

module.exports = {
	findExamples,
	saveEmptyDraft
};
