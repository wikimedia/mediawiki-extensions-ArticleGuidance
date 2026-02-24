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

	const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
	const store = useArticleGuidanceStore();

	/**
	 * Perform search with current query and language
	 *
	 * @param {string} searchQuery - Query string to search for
	 * @return {Promise<void>}
	 */
	const performSearch = async ( searchQuery ) => {
		if ( !searchQuery || searchQuery.trim().length < 2 ) {
			results.value = [];
			loading.value = false;
			return;
		}

		loading.value = true;
		error.value = null;

		try {
			// Get Wikidata search results
			const wikidataResults = await searchWikidata( searchQuery, language.value );

			if ( wikidataResults.length === 0 ) {
				results.value = [];
				return;
			}

			// Extract Q IDs from search results
			const searchQIds = wikidataResults.map( ( result ) => result.id );

			// Get all outlines (cached after first fetch)
			const outlines = await store.loadOutlines();

			// Extract article-type Q IDs from outlines
			const outlineQIds = outlines
				.map( ( outline ) => outline.articleType )
				.filter( ( qid ) => qid ); // Filter out any null/undefined

			if ( outlineQIds.length === 0 ) {
				// No outlines configured, show no results
				results.value = [];
				return;
			}

			// Use SPARQL to find all matches between search results and outline types
			// Returns { searchQId: [outlineQId1, outlineQId2, ...] }
			const sparqlMatches = await findTypeMatches( searchQIds, outlineQIds );

			// Create maps of outlineQId -> hierarchyDepth and outlineQId -> thumbnail
			const depthMap = {};
			const thumbnailMap = {};
			outlines.forEach( ( outline ) => {
				if ( outline.articleType ) {
					if ( outline.hierarchyDepth !== null ) {
						depthMap[ outline.articleType ] = outline.hierarchyDepth;
					}
					if ( outline.thumbnail ) {
						thumbnailMap[ outline.articleType ] = outline.thumbnail;
					}
				}
			} );

			// Build matched results
			const matchedResults = [];

			wikidataResults.forEach( ( result ) => {
				const matchedTypes = sparqlMatches[ result.id ];
				if ( matchedTypes && matchedTypes.length > 0 ) {
					matchedTypes.forEach( ( matchedQId ) => {
						matchedResults.push( {
							id: result.id,
							label: result.label,
							description: result.description,
							url: result.url,
							matchedQId: matchedQId,
							hierarchyDepth: depthMap[ matchedQId ] || 0,
							thumbnail: thumbnailMap[ matchedQId ] || null
						} );
					} );
				}
			} );

			// Group results by item ID to find max depth per item (not globally)
			const resultsByItemId = {};
			matchedResults.forEach( ( result ) => {
				if ( !resultsByItemId[ result.id ] ) {
					resultsByItemId[ result.id ] = [];
				}
				resultsByItemId[ result.id ].push( result );
			} );

			// Filter each item's results to show only the most specific matches
			const filteredResults = [];
			Object.values( resultsByItemId ).forEach( ( itemResults ) => {
				// Find the maximum depth for this specific item
				const maxDepthForItem = itemResults.reduce(
					( max, result ) => Math.max( max, result.hierarchyDepth || 0 ),
					0
				);

				// Keep only results at the maximum depth for this item
				// If maxDepthForItem is 0 (no depth data), show all matches for this item
				const filteredItemResults = maxDepthForItem > 0 ?
					itemResults.filter( ( result ) => result.hierarchyDepth === maxDepthForItem ) :
					itemResults;

				filteredItemResults.forEach( ( item ) => {
					filteredResults.push( item );
				} );
			} );

			results.value = filteredResults;
		} catch ( err ) {
			error.value = err.message || 'Failed to search Wikidata';
			results.value = [];
		} finally {
			loading.value = false;
		}
	};

	// Watch search query with debouncing
	watch( query, ( newQuery ) => {
		// Clear previous timer
		if ( debounceTimer ) {
			clearTimeout( debounceTimer );
		}

		// Don't search if query is too short
		if ( !newQuery || newQuery.trim().length < 2 ) {
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
		if ( query.value && query.value.trim().length >= 2 ) {
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
