/**
 * SPARQL query utilities for Wikidata
 */

const PROP_INSTANCE_OF = 'P31';
const PROP_SUBCLASS_OF = 'P279';
const PROP_PARENT_TAXON = 'P171';

// Queries with a single VALUES ?outlineType entry time out on the Wikidata SPARQL
// endpoint. Padding to two fixes this. Q1 never matches and is ignored in results.
const OUTLINE_SENTINEL_QID = 'Q1';

// Page-scoped cache: cleared automatically on page reload.
// Key: `${pathKey}|${itemQId}`, Value: Set<outlineQId>
const hierarchyCache = new Map();

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
			Accept: 'application/sparql-results+json'
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
 * Check which outline types each item reaches via hierarchy traversal.
 *
 * Accepts item QIDs directly (from wbsearchentities results), avoiding the need
 * to wait for wbgetentities P31 values before querying. Runs one query per group
 * in parallel, skipping items already present in the page-scoped cache.
 *
 * Uses `+` (one or more hops) for normal groups to avoid redundancy with zero-hop
 * checks performed by the caller. Uses `*` (zero or more) for the excluded group
 * so that direct P31 matches are also caught.
 *
 * @param {string[]} itemQIds Array of Wikidata item Q IDs
 * @param {Object} groups Map of groupKey → outlineQId[]
 * @param {string[]} excludedItemTypes Array of excluded item type Q IDs
 * @return {Promise<Object>} Map of { groupKey: { itemQId: Set<outlineQId> } }
 */
async function checkItemHierarchyMatches( itemQIds, groups, excludedItemTypes ) {
	const EXCLUDED_KEY = '__excluded__';

	if ( !itemQIds || itemQIds.length === 0 ) {
		return {};
	}

	const allGroups = Object.assign( {}, groups );
	if ( excludedItemTypes && excludedItemTypes.length > 0 ) {
		allGroups[ EXCLUDED_KEY ] = excludedItemTypes;
	}

	if ( Object.keys( allGroups ).length === 0 ) {
		return {};
	}

	const result = {};
	const queryTasks = [];

	Object.entries( allGroups ).forEach( ( [ key, outlineQIds ] ) => {
		if ( !outlineQIds || outlineQIds.length === 0 ) {
			return;
		}

		const isExcluded = key === EXCLUDED_KEY;

		let pathExpr, pathKey;
		if ( isExcluded ) {
			pathExpr = 'wdt:' + PROP_INSTANCE_OF + '/wdt:' + PROP_SUBCLASS_OF + '*';
			pathKey = PROP_INSTANCE_OF + '/' + PROP_SUBCLASS_OF + '*';
		} else if ( key === PROP_PARENT_TAXON ) {
			pathExpr = 'wdt:' + PROP_PARENT_TAXON + '+';
			pathKey = PROP_PARENT_TAXON + '+';
		} else {
			const prop = key === 'default' ? PROP_INSTANCE_OF : key;
			pathExpr = 'wdt:' + prop + '/wdt:' + PROP_SUBCLASS_OF + '+';
			pathKey = prop + '/' + PROP_SUBCLASS_OF + '+';
		}

		const cachedForGroup = {};
		const uncachedItemQIds = [];

		itemQIds.forEach( ( itemQId ) => {
			const cacheKey = pathKey + '|' + itemQId;
			if ( hierarchyCache.has( cacheKey ) ) {
				const cached = hierarchyCache.get( cacheKey );
				if ( cached.size > 0 ) {
					cachedForGroup[ itemQId ] = cached;
				}
			} else {
				uncachedItemQIds.push( itemQId );
			}
		} );

		if ( Object.keys( cachedForGroup ).length > 0 ) {
			result[ key ] = Object.assign( {}, cachedForGroup );
		}

		if ( uncachedItemQIds.length > 0 ) {
			queryTasks.push( { key, pathKey, pathExpr, outlineQIds, uncachedItemQIds } );
		}
	} );

	if ( queryTasks.length === 0 ) {
		return result;
	}

	const queryPromises = queryTasks.map( ( task ) => {
		const itemValues = task.uncachedItemQIds.map( ( qid ) => 'wd:' + qid ).join( ' ' );
		const paddedOutlines = task.outlineQIds.length === 1 ?
			task.outlineQIds.concat( [ OUTLINE_SENTINEL_QID ] ) :
			task.outlineQIds;
		const outlineValues = paddedOutlines.map( ( qid ) => 'wd:' + qid ).join( ' ' );

		const query =
			'SELECT ?item ?outlineType WHERE {\n' +
			'  VALUES ?item { ' + itemValues + ' }\n' +
			'  VALUES ?outlineType { ' + outlineValues + ' }\n' +
			'  ?item ' + task.pathExpr + ' ?outlineType .\n' +
			'}';

		return executeSparql( query ).then( ( data ) => {
			const bindings = ( data.results && data.results.bindings ) || [];
			const itemOutlineMap = {};

			bindings.forEach( ( binding ) => {
				const itemQId = extractQId( binding.item.value );
				const outlineQId = extractQId( binding.outlineType.value );
				if ( outlineQId === OUTLINE_SENTINEL_QID ) {
					return;
				}
				if ( !itemOutlineMap[ itemQId ] ) {
					itemOutlineMap[ itemQId ] = new Set();
				}
				itemOutlineMap[ itemQId ].add( outlineQId );
			} );

			task.uncachedItemQIds.forEach( ( itemQId ) => {
				const cacheKey = task.pathKey + '|' + itemQId;
				hierarchyCache.set( cacheKey, itemOutlineMap[ itemQId ] || new Set() );
			} );

			return { key: task.key, itemOutlineMap };
		} );
	} );

	const queryResults = await Promise.all( queryPromises );

	queryResults.forEach( ( queryResult ) => {
		if ( Object.keys( queryResult.itemOutlineMap ).length === 0 ) {
			return;
		}
		if ( !result[ queryResult.key ] ) {
			result[ queryResult.key ] = {};
		}
		Object.entries( queryResult.itemOutlineMap ).forEach( ( [ itemQId, outlineSet ] ) => {
			result[ queryResult.key ][ itemQId ] = outlineSet;
		} );
	} );

	return result;
}

module.exports = { checkItemHierarchyMatches };
