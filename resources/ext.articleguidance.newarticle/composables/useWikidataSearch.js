const { ref, watch } = require( 'vue' );
const { searchWikidata, fetchEntityClaims } = require( '../api/Wikidata.js' );
const { getCommonsThumbUrl } = require( '../utils/commonsThumb.js' );
const { checkHierarchyMatches } = require( '../api/Sparql.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );

const PROP_INSTANCE_OF = 'P31';

const propForGroup = ( key ) => key === 'default' ? PROP_INSTANCE_OF : key;

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
 * Select the most specific outline match per item.
 *
 * Specificity is determined in two steps:
 * 1. Prefer non-default matchVia strategies (e.g. P106 occupation) over default
 *    P31/P279 matches. This prevents a deeply-nested type like Q5 (human) from
 *    outranking a shallower occupation type like Q10833314 (tennis player).
 * 2. Within the surviving strategy group, keep only the highest-depth matches.
 *
 * @param {Object} matches - Map of { itemQId: string[] }
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
 * Merge hierarchy match results into the item→outlineQIds matches map.
 *
 * @param {Object} matches Mutable map of { itemQId: outlineQId[] }
 * @param {Object} directTypesByGroup Map of { groupKey: { itemQId: Set<directTypeQId> } }
 * @param {Object} hierarchyMatches Map of { groupKey: { directTypeQId: Set<outlineQId> } }
 */
function applyHierarchyMatches( matches, directTypesByGroup, hierarchyMatches ) {
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
}

/**
 * Composable for searching Wikidata with outline matching and hierarchy depth filtering
 *
 * Filters search results to show only the most specific matching outlines based on
 * hierarchy depth (P279 ancestor count). When a search result matches multiple
 * outlines at different depths, only the highest-depth (most specific) matches are shown
 * for that specific item. Each matched item appears in the results, showing only its
 * most specific type(s).
 *
 * @param {ref<string>} query - Reactive reference to search query
 * @param {ref<string>} language - Reactive reference to selected language
 * @return {Object} Object containing results ref, loading state, and error state
 */
function useWikidataSearch( query, language ) {
	const results = ref( [] );
	const loading = ref( false );
	const error = ref( null );
	let debounceTimer = null;
	let latestRequestId = 0;

	const store = useArticleGuidanceStore();

	/**
	 * Perform search with current query and language
	 *
	 * @param {string} searchQuery - Query string to search for
	 * @return {Promise<void>}
	 */
	const performSearch = async ( searchQuery ) => {
		const requestId = ++latestRequestId;
		if ( !searchQuery || searchQuery.trim().length < 1 ) {
			results.value = [];
			loading.value = false;
			return;
		}

		loading.value = true;
		error.value = null;

		try {
			// Get Wikidata search results
			const wikidataResults = await searchWikidata( searchQuery, language.value );

			if ( requestId !== latestRequestId ) {
				return;
			}

			if ( wikidataResults.length === 0 ) {
				results.value = [];
				return;
			}

			// Extract Q IDs from search results
			const searchQIds = wikidataResults.map( ( result ) => result.id );

			// Get all outlines (cached after first fetch)
			const outlines = await store.loadOutlines();

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Filter outlines to those with a valid article type
			const validOutlines = outlines.filter( ( outline ) => outline.articleType );

			if ( validOutlines.length === 0 ) {
				// No outlines configured, show no results
				results.value = [];
				return;
			}

			// Group outlines by matchVia and collect the properties to look up
			const groups = groupOutlinesByMatchVia( validOutlines );
			const properties = Object.keys( groups ).map( propForGroup ).filter(
				( p, i, arr ) => arr.indexOf( p ) === i
			);

			// Fetch direct property values (P31/P106/P171) for all search results
			// via wbgetentities — replaces SPARQL Query 1
			const entityData = await fetchEntityClaims( searchQIds, properties );

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Build directTypesByGroup from all search results upfront
			const directTypesByGroup = {};
			Object.keys( groups ).forEach( ( key ) => {
				const prop = propForGroup( key );
				const itemTypeMap = {};
				searchQIds.forEach( ( qid ) => {
					const typeValues =
					( entityData[ qid ] && entityData[ qid ].claims[ prop ] ) || [];
					if ( typeValues.length > 0 ) {
						itemTypeMap[ qid ] = new Set( typeValues );
					}
				} );
				directTypesByGroup[ key ] = itemTypeMap;
			} );

			// Merge exclusion types as a special group so both checks run in one SPARQL query
			const EXCLUDED_KEY = '__excluded__';
			const excludedItemTypesList =
				mw.config.get( 'wgArticleGuidanceExcludedItemTypes' ) || [];
			const queryGroups = Object.assign( {}, groups );
			const queryDirectTypes = Object.assign( {}, directTypesByGroup );
			if ( excludedItemTypesList.length > 0 ) {
				queryGroups[ EXCLUDED_KEY ] = excludedItemTypesList;
				queryDirectTypes[ EXCLUDED_KEY ] = directTypesByGroup.default || {};
			}

			// Single SPARQL query: hierarchy matching and exclusion combined
			const queryResult = await checkHierarchyMatches( queryGroups, queryDirectTypes );

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Exclude items whose P31 is (directly or via P279+) a configured excluded type
			const excludedTypeSet = new Set( excludedItemTypesList );
			const exclusionMap = queryResult[ EXCLUDED_KEY ] || {};
			const filteredQIds = searchQIds.filter( ( qid ) => {
				const p31Values =
					( entityData[ qid ] && entityData[ qid ].claims[ PROP_INSTANCE_OF ] ) || [];
				return !p31Values.some( ( v ) => excludedTypeSet.has( v ) || exclusionMap[ v ] );
			} );
			const filteredWikidataResults = wikidataResults.filter(
				( r ) => filteredQIds.includes( r.id )
			);

			// Collect matches, starting with 0-hop cases
			const outlineQIdSet = new Set(
				validOutlines.map( ( o ) => o.articleType ).filter( Boolean )
			);
			const matches = {};

			// Pre-check: item is itself an outline type (e.g. searching for 'Animalia')
			filteredQIds.forEach( ( qid ) => {
				if ( outlineQIdSet.has( qid ) ) {
					matches[ qid ] = [ qid ];
				}
			} );

			// Direct P31 → outline-type match (cross-group 0-hop)
			const defaultItemTypeMap = directTypesByGroup.default || {};
			filteredQIds.forEach( ( qid ) => {
				const directTypes = defaultItemTypeMap[ qid ];
				if ( !directTypes ) {
					return;
				}
				directTypes.forEach( ( directType ) => {
					if ( outlineQIdSet.has( directType ) ) {
						if ( !matches[ qid ] ) {
							matches[ qid ] = [];
						}
						if ( !matches[ qid ].includes( directType ) ) {
							matches[ qid ].push( directType );
						}
					}
				} );
			} );

			delete queryResult[ EXCLUDED_KEY ];
			applyHierarchyMatches( matches, directTypesByGroup, queryResult );
			const sparqlMatches = selectBestMatches( matches, validOutlines );

			// Build outline lookup and map SPARQL results to display objects
			const outlineByType = {};
			outlines.forEach( ( outline ) => {
				if ( outline.articleType ) {
					outlineByType[ outline.articleType ] = outline;
				}
			} );

			const filteredResults = [];
			filteredWikidataResults.forEach( ( result ) => {
				const matchedQIds = sparqlMatches[ result.id ];
				if ( !matchedQIds || matchedQIds.length === 0 ) {
					return;
				}
				const outlineNames = [];
				let thumbnail = null;
				matchedQIds.forEach( ( matchedQId ) => {
					const outline = outlineByType[ matchedQId ];
					if ( !outline ) {
						return;
					}
					if ( outline.label && !outlineNames.includes( outline.label ) ) {
						outlineNames.push( outline.label );
					}
					if ( !thumbnail && outline.thumbnail ) {
						thumbnail = outline.thumbnail;
					}
				} );
				const entity = entityData[ result.id ];
				const entityFilename = entity && entity.imageFilename;
				filteredResults.push( {
					id: result.id,
					label: result.label,
					description: result.description,
					url: result.url,
					matchedQId: matchedQIds[ 0 ],
					thumbnail: ( entityFilename && getCommonsThumbUrl( entityFilename ) ) ||
						thumbnail,
					outlineName: outlineNames.length > 0 ? outlineNames.join( ', ' ) : null,
					sitelinkCount: entity ? entity.sitelinkCount : 0,
					localSitelink: entity ? entity.localSitelink : null
				} );
			} );

			if ( requestId !== latestRequestId ) {
				return;
			}
			results.value = filteredResults;
		} catch ( err ) {
			if ( requestId !== latestRequestId ) {
				return;
			}
			error.value = err.message || 'Failed to search Wikidata';
			results.value = [];
		} finally {
			if ( requestId === latestRequestId ) {
				loading.value = false;
			}
		}
	};

	// Watch search query with debouncing
	watch( query, ( newQuery ) => {
		// Clear previous timer
		if ( debounceTimer ) {
			clearTimeout( debounceTimer );
		}

		// Don't search if query is too short
		if ( !newQuery || newQuery.trim().length < 1 ) {
			results.value = [];
			loading.value = false;
			return;
		}

		// Set new timer for debounced search
		debounceTimer = setTimeout( () => {
			performSearch( newQuery );
		}, 300 ); // 300ms debounce delay
	} );

	// Watch language changes and re-search
	watch( language, () => {
		// Re-search with current query when language changes
		if ( query.value && query.value.trim().length >= 1 ) {
			performSearch( query.value );
		}
	} );

	return {
		results,
		loading,
		error,
		performSearch
	};
}

module.exports = useWikidataSearch;
