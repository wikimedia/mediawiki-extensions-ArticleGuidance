'use strict';

const PROP_INSTANCE_OF = 'P31';
const EXCLUDED_KEY = '__excluded__';

/**
 * Map a matchVia group key to the Wikidata property it represents.
 *
 * @param {string} key
 * @return {string}
 */
function propForGroup( key ) {
	return key === 'default' ? PROP_INSTANCE_OF : key;
}

/**
 * Group outline articleType Q IDs by their matchVia property value.
 *
 * @param {Array} outlines
 * @return {Object} Map of matchVia key → array of Q IDs
 */
function groupOutlinesByMatchVia( outlines ) {
	return outlines.reduce( ( groups, outline ) => {
		const key = outline.matchVia || 'default';
		if ( !groups[ key ] ) {
			groups[ key ] = [];
		}
		groups[ key ].push( outline.articleType );
		return groups;
	}, {} );
}

/**
 * Record direct (0-hop) outline-type matches across every matchVia group.
 *
 * For each item, examines the direct property values gathered by wbgetentities
 * (P31, P106, etc.) and records a match when the value is itself the article
 * type of an outline. This complements the SPARQL hierarchy query, which uses
 * `+` (one or more P279 hops) and therefore would miss e.g. an item whose P106
 * is exactly an outline's articleType.
 *
 * @param {Object} matches Mutable map of { itemQId: outlineQId[] }
 * @param {string[]} itemQIds Item Q IDs to consider
 * @param {Object} directTypesByGroup Map of { groupKey: { itemQId: Set<typeQId> } }
 * @param {Set<string>} outlineQIdSet Set of outline article-type Q IDs
 */
function collectDirectMatches( matches, itemQIds, directTypesByGroup, outlineQIdSet ) {
	Object.values( directTypesByGroup ).forEach( ( itemTypeMap ) => {
		itemQIds.forEach( ( qid ) => {
			const directTypes = itemTypeMap[ qid ];
			if ( !directTypes ) {
				return;
			}
			directTypes.forEach( ( directType ) => {
				if ( !outlineQIdSet.has( directType ) ) {
					return;
				}
				if ( !matches[ qid ] ) {
					matches[ qid ] = [];
				}
				if ( !matches[ qid ].includes( directType ) ) {
					matches[ qid ].push( directType );
				}
			} );
		} );
	} );
}

/**
 * Merge item-level hierarchy match results into the item→outlineQIds matches map.
 *
 * @param {Object} matches Mutable map of { itemQId: outlineQId[] }
 * @param {Object} itemHierarchyMatches Map of { groupKey: { itemQId: Set<outlineQId> } }
 */
function applyHierarchyMatches( matches, itemHierarchyMatches ) {
	Object.entries( itemHierarchyMatches ).forEach( ( [ key, itemOutlineMap ] ) => {
		if ( key === EXCLUDED_KEY ) {
			return;
		}
		Object.entries( itemOutlineMap ).forEach( ( [ itemQId, outlineSet ] ) => {
			if ( !matches[ itemQId ] ) {
				matches[ itemQId ] = [];
			}
			outlineSet.forEach( ( outlineQId ) => {
				if ( !matches[ itemQId ].includes( outlineQId ) ) {
					matches[ itemQId ].push( outlineQId );
				}
			} );
		} );
	} );
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
 * @param {Object} matches Map of { itemQId: string[] }
 * @param {Array} outlines Outline objects with articleType, matchVia, hierarchyDepth
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

module.exports = {
	PROP_INSTANCE_OF,
	EXCLUDED_KEY,
	propForGroup,
	groupOutlinesByMatchVia,
	collectDirectMatches,
	applyHierarchyMatches,
	selectBestMatches
};
