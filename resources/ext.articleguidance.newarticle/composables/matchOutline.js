const { fetchEntityClaims } = require( '../api/Wikidata.js' );
const { checkItemHierarchyMatches } = require( '../api/Sparql.js' );
const { withRetry } = require( '../utils/retry.js' );
const { reportOutlineMatch } = require( '../logging/search.js' );
const {
	getTypedOutlines,
	propForGroup,
	groupOutlinesByMatchVia,
	collectDirectMatches,
	applyHierarchyMatches,
	selectBestMatches
} = require( './outlineMatching.js' );

/**
 * Find the outline article type that a Wikidata item matches.
 *
 * Runs for the selected search result only, because the SPARQL hierarchy
 * query is slow (T439877).
 *
 * @param {string} itemQId Q ID of the selected item
 * @param {Array} outlines Loaded outlines
 * @param {string} language Language code for the wbgetentities request
 * @return {Promise<string|null>} Article-type Q ID of the most specific matching
 *   outline, or null when no outline matches
 */
async function matchOutline( itemQId, outlines, language ) {
	// The generic outline declares no article type (T428152)
	const typedOutlines = getTypedOutlines( outlines );
	if ( typedOutlines.length === 0 ) {
		return null;
	}

	const groups = groupOutlinesByMatchVia( typedOutlines );
	const [ entityData, itemHierarchyMatches ] = await Promise.all( [
		withRetry( () => fetchEntityClaims( [ itemQId ], language ) ),
		withRetry( () => checkItemHierarchyMatches( [ itemQId ], groups ) )
	] );

	const outlineQIdSet = new Set();
	typedOutlines.forEach( ( outline ) => {
		outline.articleTypes.forEach( ( typeEntry ) => outlineQIdSet.add( typeEntry.id ) );
	} );

	// Item is itself an outline type (e.g. searching for 'Animalia')
	const matches = {};
	if ( outlineQIdSet.has( itemQId ) ) {
		matches[ itemQId ] = [ itemQId ];
	}

	// The SPARQL query uses `+`, so it misses direct (0-hop) matches
	const entity = entityData[ itemQId ];
	if ( entity ) {
		const directTypesByGroup = {};
		Object.keys( groups ).forEach( ( key ) => {
			const typeValues = entity.claims[ propForGroup( key ) ] || [];
			directTypesByGroup[ key ] = typeValues.length > 0 ?
				{ [ itemQId ]: new Set( typeValues ) } :
				{};
		} );
		collectDirectMatches( matches, [ itemQId ], directTypesByGroup, outlineQIdSet );
	}

	applyHierarchyMatches( matches, itemHierarchyMatches );
	const bestMatches = selectBestMatches( matches, typedOutlines )[ itemQId ] || [];
	reportOutlineMatch( itemQId, bestMatches, typedOutlines );
	return bestMatches.length > 0 ? bestMatches[ 0 ] : null;
}

module.exports = { matchOutline };
