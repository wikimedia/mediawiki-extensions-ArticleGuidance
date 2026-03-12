/**
 * SPARQL query utilities for Wikidata
 */

const PROP_INSTANCE_OF = 'P31';
const PROP_SUBCLASS_OF = 'P279';
const PROP_PARENT_TAXON = 'P171';

/**
 * Build the hierarchy traversal path used in Query 2.
 *
 * - 'P171' → wdt:P171* (parent-taxon chain for biological taxons)
 * - null/default or any other P-id → wdt:P279* (subclass chain)
 *
 * @param {string|null} matchVia - Wikidata property ID or null for default
 * @return {string} SPARQL property path
 */
function buildHierarchyPath( matchVia ) {
	if ( matchVia === PROP_PARENT_TAXON ) {
		return `wdt:${ PROP_PARENT_TAXON }*`;
	}
	return `wdt:${ PROP_SUBCLASS_OF }*`;
}

/**
 * Group outlines by their matchVia value
 *
 * @param {Array} outlines - Array of outline objects with articleType and matchVia
 * @return {Object} Map of matchVia key → array of Q IDs
 */
function groupOutlinesByMatchVia( outlines ) {
	const groups = {};
	outlines.forEach( ( outline ) => {
		const key = outline.matchVia || 'default';
		if ( !groups[ key ] ) {
			groups[ key ] = [];
		}
		groups[ key ].push( outline.articleType );
	} );
	return groups;
}

/**
 * Select the most specific outline match per item.
 *
 * Specificity is determined in two steps:
 * 1. Prefer non-default matchVia strategies (e.g. P106 occupation) over default
 *    P31/P279 matches. This prevents a deeply-nested type like Q5 (human) from
 *    outranking a shallower occupation type like Q10833314 (tennis player).
 * 2. Within the surviving strategy group, keep only the highest-depth matches.
 *
 * @param {Object} matches - Map of { itemQId: string[] } from SPARQL matching
 * @param {Array} outlines - Outline objects with articleType, matchVia, hierarchyDepth
 * @return {Object} Filtered map of { itemQId: string[] }
 */
function selectBestMatches( matches, outlines ) {
	const depthByType = {};
	const matchViaByType = {};
	outlines.forEach( ( outline ) => {
		if ( outline.articleType ) {
			depthByType[ outline.articleType ] = outline.hierarchyDepth || 0;
			matchViaByType[ outline.articleType ] = outline.matchVia || null;
		}
	} );

	const result = {};
	Object.entries( matches ).forEach( ( [ itemQId, outlineQIds ] ) => {
		// Step 1: prefer non-default matchVia
		const hasNonDefault = outlineQIds.some( ( qid ) => matchViaByType[ qid ] !== null );
		const strategyFiltered = hasNonDefault ?
			outlineQIds.filter( ( qid ) => matchViaByType[ qid ] !== null ) :
			outlineQIds;

		// Step 2: keep only the highest-depth matches within the surviving group
		const maxDepth = strategyFiltered.reduce(
			( max, qid ) => Math.max( max, depthByType[ qid ] || 0 ),
			0
		);
		result[ itemQId ] = maxDepth > 0 ?
			strategyFiltered.filter( ( qid ) => ( depthByType[ qid ] || 0 ) === maxDepth ) :
			strategyFiltered;
	} );
	return result;
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
 * Query 1: Fetch direct property values for each search result item, per matchVia group.
 *
 * Runs one simple query per group in parallel (no traversal, flat lookup only):
 * - default group → wdt:P31 (instance of)
 * - P171 group    → wdt:P171 (parent taxon, one hop)
 * - P106/other    → wdt:P{n} (that property, one hop)
 *
 * DISTINCT collapses items that share the same direct type (e.g. many human search
 * results all resolving to Q5), so Query 2 only traverses that type once.
 *
 * @param {Array<string>} specificQIds
 * @param {Object} groups Map of groupKey → outlineQIds
 * @return {Promise<Object>} Map of { groupKey: { itemQId: Set<directTypeQId> } }
 */
async function fetchDirectTypes( specificQIds, groups ) {
	const specificValues = specificQIds.map( ( qid ) => `wd:${ qid }` ).join( ' ' );
	const result = {};

	await Promise.all(
		Object.keys( groups ).map( async ( key ) => {
			const prop = key === 'default' ? PROP_INSTANCE_OF : key;
			const query =
				'SELECT DISTINCT ?specificItem ?directType WHERE {\n' +
				`  VALUES ?specificItem { ${ specificValues } }\n` +
				`  ?specificItem wdt:${ prop } ?directType .\n}`;

			const data = await executeSparql( query );
			const itemTypeMap = {};

			if ( data.results && data.results.bindings ) {
				data.results.bindings.forEach( ( binding ) => {
					const item = extractQId( binding.specificItem.value );
					const type = extractQId( binding.directType.value );
					if ( !itemTypeMap[ item ] ) {
						itemTypeMap[ item ] = new Set();
					}
					itemTypeMap[ item ].add( type );
				} );
			}

			result[ key ] = itemTypeMap;
		} )
	);

	return result;
}

/**
 * Query 2: Check which outline types each direct type reaches via hierarchy traversal.
 *
 * Runs a single combined query with one UNION branch per matchVia group.
 * Direct types are deduplicated across items within each group, so a common type
 * (e.g. Q5 shared by many human results) is only traversed once.
 *
 * Each outline type belongs to exactly one group, so the group for each result row
 * is derived from the outlineType using a reverse lookup instead of BIND.
 *
 * @param {Object} groups Map of groupKey → outlineQIds
 * @param {Object} directTypesByGroup Output of fetchDirectTypes
 * @return {Promise<Object>} Map of { groupKey: { directTypeQId: Set<outlineQId> } }
 */
async function checkHierarchyMatches( groups, directTypesByGroup ) {
	// Each outline belongs to exactly one group — build a reverse map
	const outlineToGroup = {};
	Object.entries( groups ).forEach( ( [ key, qids ] ) => {
		qids.forEach( ( qid ) => {
			outlineToGroup[ qid ] = key;
		} );
	} );

	const branches = [];

	Object.entries( groups ).forEach( ( [ key, outlineQIds ] ) => {
		const matchVia = key === 'default' ? null : key;
		const itemTypeMap = directTypesByGroup[ key ] || {};
		const allDirectTypes = [];
		Object.values( itemTypeMap ).forEach( ( typeSet ) => {
			typeSet.forEach( ( type ) => {
				if ( !allDirectTypes.includes( type ) ) {
					allDirectTypes.push( type );
				}
			} );
		} );

		if ( allDirectTypes.length === 0 || outlineQIds.length === 0 ) {
			return;
		}

		const directTypeValues = allDirectTypes.map( ( qid ) => `wd:${ qid }` ).join( ' ' );
		const outlineValues = outlineQIds.map( ( qid ) => `wd:${ qid }` ).join( ' ' );
		const path = buildHierarchyPath( matchVia );

		branches.push(
			`  {\n    VALUES ?directType { ${ directTypeValues } }\n` +
			`    VALUES ?outlineType { ${ outlineValues } }\n` +
			`    ?directType ${ path } ?outlineType .\n  }`
		);
	} );

	if ( branches.length === 0 ) {
		return {};
	}

	const query =
		'SELECT ?directType ?outlineType WHERE {\n' +
		`${ branches.join( ' UNION\n' ) }\n}`;

	const data = await executeSparql( query );
	const result = {};

	if ( data.results && data.results.bindings ) {
		data.results.bindings.forEach( ( binding ) => {
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
	}

	return result;
}

/**
 * Find matches between specific items and supported outline types using SPARQL
 *
 * Uses two queries instead of one for better performance:
 *
 * Query 1 – Direct-type lookup (no hierarchy traversal):
 *   One query per matchVia group, run in parallel. Fetches wdt:P31 / wdt:P106 /
 *   wdt:P171 values for all search result items. DISTINCT collapses items that
 *   share a direct type so Query 2 traverses each unique type only once.
 *
 * Query 2 – Hierarchy check (single combined query):
 *   For each distinct direct type, checks whether it reaches any outline type via
 *   wdt:P279* (default / P106 groups) or wdt:P171* (taxon group). One UNION branch
 *   per matchVia group; the group for each result row is recovered from the
 *   outlineType via a reverse lookup (each outline belongs to exactly one group).
 *
 * Returns only the most specific match per item via selectBestMatches.
 *
 * @param {Array<string>} specificQIds Q IDs from search results (e.g., ['Q937', 'Q243'])
 * @param {Array<Object>} outlines Outline objects with `articleType`, `matchVia`, `hierarchyDepth`
 * @return {Promise<Object>} Map of { specificQId: [matchedQId1, matchedQId2, ...] }
 */
async function findTypeMatches( specificQIds, outlines ) {
	if ( !specificQIds || specificQIds.length === 0 ||
		!outlines || outlines.length === 0 ) {
		return {};
	}

	const groups = groupOutlinesByMatchVia( outlines );
	const matches = {};

	// Pre-check: if a search result is itself an outline type (0-hop match), record
	// it directly. This covers edge cases like searching for 'Animalia' (Q729) against
	// the Animal outline, which the one-hop P171 fetch in Q1 would otherwise miss.
	const outlineQIdSet = new Set( outlines.map( ( o ) => o.articleType ).filter( Boolean ) );
	specificQIds.forEach( ( qid ) => {
		if ( outlineQIdSet.has( qid ) ) {
			matches[ qid ] = [ qid ];
		}
	} );

	try {
		// Query 1: fetch direct property values per item per group (parallel)
		const directTypesByGroup = await fetchDirectTypes( specificQIds, groups );

		const hasAnyTypes = Object.values( directTypesByGroup ).some(
			( itemMap ) => Object.keys( itemMap ).length > 0
		);
		if ( !hasAnyTypes ) {
			return matches;
		}

		// Direct P31 → outline-type match (cross-group 0-hop).
		// Handles items whose P31 directly IS an outline type that lives in a non-default
		// group (e.g. Eagle Q2092297 has P31 = Bird Q5113, but Bird is in the P171 group
		// so Query 2 would never check it against the default group's direct types).
		const defaultItemTypeMap = directTypesByGroup.default || {};
		Object.entries( defaultItemTypeMap ).forEach( ( [ itemQId, directTypes ] ) => {
			directTypes.forEach( ( directType ) => {
				if ( outlineQIdSet.has( directType ) ) {
					if ( !matches[ itemQId ] ) {
						matches[ itemQId ] = [];
					}
					if ( !matches[ itemQId ].includes( directType ) ) {
						matches[ itemQId ].push( directType );
					}
				}
			} );
		} );

		// Query 2: hierarchy traversal from direct types to outline types
		const hierarchyMatches = await checkHierarchyMatches( groups, directTypesByGroup );

		// Combine: for each item, collect outline types reached via its direct types
		Object.entries( directTypesByGroup ).forEach( ( [ key, itemTypeMap ] ) => {
			const typeOutlineMap = hierarchyMatches[ key ] || {};
			Object.entries( itemTypeMap ).forEach( ( [ itemQId, directTypes ] ) => {
				directTypes.forEach( ( directType ) => {
					const outlineTypes = typeOutlineMap[ directType ];
					if ( !outlineTypes ) {
						return;
					}
					if ( !matches[ itemQId ] ) {
						matches[ itemQId ] = [];
					}
					outlineTypes.forEach( ( outlineQId ) => {
						if ( !matches[ itemQId ].includes( outlineQId ) ) {
							matches[ itemQId ].push( outlineQId );
						}
					} );
				} );
			} );
		} );
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'SPARQL query error:', error );
		// Return empty matches on error - graceful degradation
		return {};
	}

	return selectBestMatches( matches, outlines );
}

module.exports = {
	findTypeMatches,
	buildHierarchyPath,
	groupOutlinesByMatchVia
};
