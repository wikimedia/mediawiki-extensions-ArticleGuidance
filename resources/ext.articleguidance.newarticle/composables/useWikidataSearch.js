const { ref, watch } = require( 'vue' );
const { searchWikidata } = require( '../api/Wikidata.js' );
const { findTypeMatches } = require( '../api/Sparql.js' );

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

	const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
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

			// Use SPARQL to find all matches between search results and outline types
			// Returns { searchQId: [outlineQId1, outlineQId2, ...] }
			const sparqlMatches = await findTypeMatches( searchQIds, validOutlines );

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Build outline lookup and map SPARQL results to display objects
			const outlineByType = {};
			outlines.forEach( ( outline ) => {
				if ( outline.articleType ) {
					outlineByType[ outline.articleType ] = outline;
				}
			} );

			const filteredResults = [];
			wikidataResults.forEach( ( result ) => {
				const matchedQIds = sparqlMatches[ result.id ];
				if ( matchedQIds && matchedQIds.length > 0 ) {
					matchedQIds.forEach( ( matchedQId ) => {
						const outline = outlineByType[ matchedQId ];
						filteredResults.push( {
							id: result.id,
							label: result.label,
							description: result.description,
							url: result.url,
							matchedQId: matchedQId,
							matchVia: outline ? outline.matchVia || null : null,
							hierarchyDepth: outline ? outline.hierarchyDepth || 0 : 0,
							thumbnail: outline ? outline.thumbnail || null : null
						} );
					} );
				}
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
