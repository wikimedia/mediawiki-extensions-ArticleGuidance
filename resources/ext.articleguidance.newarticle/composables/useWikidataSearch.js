const { ref, watch } = require( 'vue' );
const { searchWikidata, fetchEntityClaims } = require( '../api/Wikidata.js' );
const { translateQuery } = require( '../api/Cx.js' );
const { getCommonsThumbUrl } = require( '../utils/commonsThumb.js' );
const { containsNonLatin } = require( '../utils/script.js' );
const { checkItemHierarchyMatches } = require( '../api/Sparql.js' );
const useArticleGuidanceStore = require( '../stores/useArticleGuidanceStore.js' );
const { withRetry } = require( '../utils/retry.js' );
const { reportSearchEvaluation } = require( '../logging/search.js' );
const {
	PROP_INSTANCE_OF,
	EXCLUDED_KEY,
	propForGroup,
	groupOutlinesByMatchVia,
	collectDirectMatches,
	applyHierarchyMatches,
	selectBestMatches
} = require( './outlineMatching.js' );
const config = require( '../config.json' );

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
	 * Translate the query via cxserver and search Wikidata with the translation.
	 *
	 * Best-effort fallback for non-Latin queries: returns an empty array when
	 * translation is unavailable, the translation is empty or unchanged, or the
	 * follow-up search fails, so it never blocks or breaks the native-language
	 * results it runs alongside.
	 *
	 * @param {string} searchQuery - Query string to translate and search for
	 * @return {Promise<Array>} Candidate Wikidata results for the translated query
	 */
	const searchViaTranslation = async ( searchQuery ) => {
		const targetLang = config.ArticleGuidanceCxTargetLanguage || 'en';
		const translated = await translateQuery( searchQuery, language.value, targetLang );
		if ( !translated || translated === searchQuery ) {
			return [];
		}
		try {
			return await searchWikidata( translated, targetLang );
		} catch ( err ) {
			return [];
		}
	};

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
			// Fire a cxserver-translated search preemptively (in parallel, not after
			// a zero-result) whenever the query is in a non-Latin script, so items
			// that only have a label in the translation target language can still match.
			const wikidataSearchPromise = withRetry( () => searchWikidata( searchQuery, language.value ) );
			const outlinesPromise = withRetry( () => store.loadOutlines() );
			const translationSearchPromise = containsNonLatin( searchQuery ) ?
				searchViaTranslation( searchQuery ).catch( () => [] ) :
				Promise.resolve( [] );

			// Await only the native-language Wikidata search and the outlines load first
			const [ wikidataResults, outlines ] = await Promise.all( [
				wikidataSearchPromise,
				outlinesPromise
			] );

			// skip if the user types a new character during the search
			if ( requestId !== latestRequestId ) {
				return;
			}

			// If the wikidata search returned 8 (MAX_RESULT) or more results,
			// we skip/ignore translation.
			// Note: stay in sync with MAX_TOTAL in SearchStep.vue
			let translatedResults = [];
			const MAX_RESULT = 8;
			if ( wikidataResults.length < MAX_RESULT ) {
				translatedResults = await translationSearchPromise;
			}

			// skip if the user types a new character during the search
			if ( requestId !== latestRequestId ) {
				return;
			}

			// Merge native and translated candidates, de-duplicating by Q ID and
			// tracking which items were found only via the translated query.
			const translationOnlyQIds = new Set();
			const seenQIds = new Set( wikidataResults.map( ( result ) => result.id ) );
			const mergedResults = wikidataResults.slice();
			translatedResults.forEach( ( result ) => {
				if ( !seenQIds.has( result.id ) ) {
					seenQIds.add( result.id );
					mergedResults.push( result );
					translationOnlyQIds.add( result.id );
				}
			} );

			if ( mergedResults.length === 0 ) {
				results.value = [];
				return;
			}

			// Filter outlines to those with a valid article type
			const validOutlines = outlines.filter( ( outline ) => outline.articleType );

			if ( validOutlines.length === 0 ) {
				// No outlines configured, show no results
				results.value = [];
				return;
			}

			// Extract Q IDs from search results
			const searchQIds = mergedResults.map( ( result ) => result.id );

			// Group outlines by matchVia and collect the properties to look up
			const groups = groupOutlinesByMatchVia( validOutlines );
			const properties = Object.keys( groups ).map( propForGroup ).filter(
				( p, i, arr ) => arr.indexOf( p ) === i
			);
			const excludedItemTypesList =
				mw.config.get( 'wgArticleGuidanceExcludedItemTypes' ) || [];

			// Run wbgetentities and SPARQL hierarchy check in parallel
			const [ entityData, itemHierarchyMatches ] = await Promise.all( [
				withRetry( () => fetchEntityClaims( searchQIds, properties, language.value ) ),
				withRetry( () => checkItemHierarchyMatches(
					searchQIds, groups, excludedItemTypesList
				) )
			] );

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Build directTypesByGroup for 0-hop checks (uses wbgetentities data)
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

			// Exclude items whose P31 is (directly or via P279+) a configured excluded type
			const excludedTypeSet = new Set( excludedItemTypesList );
			const exclusionByItem = itemHierarchyMatches[ EXCLUDED_KEY ] || {};
			const filteredQIds = searchQIds.filter( ( qid ) => {
				const p31Values =
					( entityData[ qid ] && entityData[ qid ].claims[ PROP_INSTANCE_OF ] ) || [];
				const isDirectlyExcluded = p31Values.some( ( v ) => excludedTypeSet.has( v ) );
				const isHierarchyExcluded =
					exclusionByItem[ qid ] && exclusionByItem[ qid ].size > 0;
				return !isDirectlyExcluded && !isHierarchyExcluded;
			} );
			const filteredWikidataResults = mergedResults.filter(
				( r ) => filteredQIds.includes( r.id ) &&
					entityData[ r.id ] && entityData[ r.id ].hasLabel
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

			// Direct property → outline-type match (0-hop via wbgetentities) across
			// every matchVia group, since the SPARQL hierarchy query uses `+` and
			// would miss e.g. an item whose P106 is itself an outline articleType.
			collectDirectMatches( matches, filteredQIds, directTypesByGroup, outlineQIdSet );

			applyHierarchyMatches( matches, itemHierarchyMatches );
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
					label: ( entity && entity.label ) || result.id,
					labelFallback: entity ? entity.labelFallback : false,
					description: ( entity && entity.description ) || '',
					url: result.url,
					matchedQId: matchedQIds[ 0 ],
					thumbnail: ( entityFilename && getCommonsThumbUrl( entityFilename ) ) ||
						thumbnail,
					outlineName: outlineNames.length > 0 ? outlineNames.join( ', ' ) : null,
					supported: true,
					sitelinkCount: entity ? entity.sitelinkCount : 0,
					localSitelink: entity ? entity.localSitelink : null,
					viaTranslation: translationOnlyQIds.has( result.id )
				} );
			} );

			filteredWikidataResults.forEach( ( result ) => {
				const matchedQIds = sparqlMatches[ result.id ];
				if ( matchedQIds && matchedQIds.length > 0 ) {
					return;
				}
				const entity = entityData[ result.id ];
				const entityFilename = entity && entity.imageFilename;
				filteredResults.push( {
					id: result.id,
					label: ( entity && entity.label ) || result.id,
					labelFallback: entity ? entity.labelFallback : false,
					description: ( entity && entity.description ) || '',
					url: result.url,
					matchedQId: null,
					thumbnail: ( entityFilename && getCommonsThumbUrl( entityFilename ) ) || null,
					outlineName: null,
					supported: false,
					sitelinkCount: entity ? entity.sitelinkCount : 0,
					localSitelink: entity ? entity.localSitelink : null,
					viaTranslation: translationOnlyQIds.has( result.id )
				} );
			} );

			reportSearchEvaluation( searchQuery, filteredResults, sparqlMatches, outlineByType );

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
			latestRequestId++;
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
