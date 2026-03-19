/**
 * SPARQL query utilities for Wikidata
 */

const PROP_SUBCLASS_OF = 'P279';
const PROP_PARENT_TAXON = 'P171';

/**
 * Build the hierarchy traversal path used in checkHierarchyMatches.
 *
 * Uses + (one or more hops) rather than * to exclude self-matches, since
 * zero-hop matches (directType === outlineType) are pre-handled by the caller.
 *
 * - 'P171' → wdt:P171+ (parent-taxon chain for biological taxons)
 * - null/default or any other P-id → wdt:P279+ (subclass chain)
 *
 * @param {string|null} matchVia - Wikidata property ID or null for default
 * @return {string} SPARQL property path
 */
function buildHierarchyPath( matchVia ) {
	if ( matchVia === PROP_PARENT_TAXON ) {
		return `wdt:${ PROP_PARENT_TAXON }+`;
	}
	return `wdt:${ PROP_SUBCLASS_OF }+`;
}

/**
 * Execute a SPARQL query against the Wikidata Query Service.
 *
 * @param {string} query SPARQL query string
 * @return {Promise<Object>} Parsed JSON response
 */
async function executeSparql( query ) {
	const url = 'https://query.wikidata.org/sparql?' + new URLSearchParams( {
		query: query,
		format: 'json'
	} );
	const response = await fetch( url, {
		headers: {
			Accept: 'application/sparql-results+json',
			'User-Agent': 'MediaWiki ArticleGuidance Extension'
		}
	} );
	if ( !response.ok ) {
		throw new Error( `SPARQL query failed: ${ response.status }` );
	}
	return response.json();
}

/**
 * Extract a Q ID from a Wikidata entity URI.
 *
 * @param {string} uri
 * @return {string}
 */
function extractQId( uri ) {
	return uri.replace( 'http://www.wikidata.org/entity/', '' );
}

/**
 * Check which outline types each direct type reaches via hierarchy traversal.
 *
 * Runs one query per matchVia group in parallel rather than a single UNION query,
 * allowing the SPARQL endpoint to process independent groups concurrently.
 * Direct types are deduplicated within each group and pre-filtered to exclude
 * types that are already outlineTypes (zero-hop matches handled by the caller).
 *
 * @param {Object} groups Map of groupKey → outlineQIds
 * @param {Object} directTypesByGroup Map of { groupKey: { itemQId: Set<directTypeQId> } }
 * @return {Promise<Object>} Map of { groupKey: { directTypeQId: Set<outlineQId> } }
 */
async function checkHierarchyMatches( groups, directTypesByGroup ) {
	// Build a branch per group, tagged with its path, and a reverse map for demuxing results
	const outlineToGroup = {};
	const branchesByPath = {};

	Object.entries( groups ).forEach( ( [ key, outlineQIds ] ) => {
		const matchVia = key === 'default' ? null : key;
		const itemTypeMap = directTypesByGroup[ key ] || {};
		const outlineQIdSet = new Set( outlineQIds );
		const allDirectTypes = [];
		Object.values( itemTypeMap ).forEach( ( typeSet ) => {
			typeSet.forEach( ( type ) => {
				if ( !allDirectTypes.includes( type ) && !outlineQIdSet.has( type ) ) {
					allDirectTypes.push( type );
				}
			} );
		} );

		if ( allDirectTypes.length === 0 || outlineQIds.length === 0 ) {
			return;
		}

		outlineQIds.forEach( ( qid ) => {
			outlineToGroup[ qid ] = key;
		} );

		const path = buildHierarchyPath( matchVia );
		const directTypeValues = allDirectTypes.map( ( qid ) => `wd:${ qid }` ).join( ' ' );
		const outlineValues = outlineQIds.map( ( qid ) => `wd:${ qid }` ).join( ' ' );
		const branch =
			`  VALUES ?directType { ${ directTypeValues } }\n` +
			`  VALUES ?outlineType { ${ outlineValues } }\n` +
			`  ?directType ${ path } ?outlineType .`;

		if ( !branchesByPath[ path ] ) {
			branchesByPath[ path ] = [];
		}
		branchesByPath[ path ].push( branch );
	} );

	if ( Object.keys( branchesByPath ).length === 0 ) {
		return {};
	}

	// One query per distinct path, run in parallel
	const queryPromises = Object.entries( branchesByPath ).map( async ( [ , branches ] ) => {
		const body = branches.map( ( b ) => `{\n${ b }\n}` ).join( '\nUNION\n' );
		const query = 'SELECT ?directType ?outlineType WHERE {\n' + body + '\n}';
		const data = await executeSparql( query );
		return ( data.results && data.results.bindings ) || [];
	} );

	const allBindings = await Promise.all( queryPromises );
	const result = {};

	allBindings.forEach( ( bindings ) => {
		bindings.forEach( ( binding ) => {
			const type = extractQId( binding.directType.value );
			const outline = extractQId( binding.outlineType.value );
			const key = outlineToGroup[ outline ];
			if ( !key ) {
				return;
			}
			if ( !result[ key ] ) {
				result[ key ] = {};
			}
			if ( !result[ key ][ type ] ) {
				result[ key ][ type ] = new Set();
			}
			result[ key ][ type ].add( outline );
		} );
	} );

	return result;
}

module.exports = { checkHierarchyMatches };
