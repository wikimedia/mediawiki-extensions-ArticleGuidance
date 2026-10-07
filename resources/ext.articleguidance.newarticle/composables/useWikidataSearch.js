const { ref, watch } = require( 'vue' );
const { searchWikidata, fetchEntityClaims } = require( '../api/Wikidata.js' );
const { translateQuery } = require( '../api/Cx.js' );
const { getCommonsThumbUrl } = require( '../utils/commonsThumb.js' );
const { containsNonLatin } = require( '../utils/script.js' );
const { withRetry } = require( '../utils/retry.js' );
const config = require( '../config.json' );

// The search step shows 8 results. The extra candidates replace items that
// processCandidates() drops.
const SEARCH_LIMIT = 12;

/**
 * Composable for searching Wikidata
 *
 * Outline matching runs later, for the selected result only (T439877).
 *
 * @param {ref<string>} query - Reactive reference to search query
 * @param {ref<string>} language - Reactive reference to selected language
 * @return {Object} Object containing results ref, loading state, and error state
 */
function useWikidataSearch( query, language ) {
	const results = ref( [] );
	const loading = ref( false );
	const error = ref( null );
	const searchPath = ref( null );
	const searchDuration = ref( null );
	let debounceTimer = null;
	let latestRequestId = 0;
	const excludedItemTypes = mw.config.get( 'wgArticleGuidanceExcludedItemTypes' ) || [];

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
			return await searchWikidata(
				translated, targetLang, SEARCH_LIMIT, excludedItemTypes
			);
		} catch ( err ) {
			return [];
		}
	};

	/**
	 * Process raw Wikidata search candidates: fetch claims, drop unlabeled items and
	 * items whose local article is outside the Main namespace, and map to display objects.
	 *
	 * @param {Array} candidates - Wikidata search results (candidates)
	 * @param {boolean} isTranslation - Whether these candidates are from translation search
	 * @return {Promise<Array>} Mapped results, in Wikidata search order
	 */
	const processCandidates = async ( candidates, isTranslation = false ) => {
		if ( candidates.length === 0 ) {
			return [];
		}

		const searchQIds = candidates.map( ( result ) => result.id );

		const entityData = await withRetry(
			() => fetchEntityClaims( searchQIds, language.value )
		);

		return candidates
			.filter( ( result ) => {
				const entity = entityData[ result.id ];
				return !!entity && entity.hasLabel &&
					!entity.localSitelinkOutsideMainNamespace;
			} )
			.map( ( result ) => {
				const entity = entityData[ result.id ];
				return {
					id: result.id,
					label: entity.label,
					labelFallback: entity.labelFallback,
					description: entity.description,
					url: result.url,
					thumbnail: ( entity.imageFilename &&
						getCommonsThumbUrl( entity.imageFilename ) ) || null,
					sitelinkCount: entity.sitelinkCount,
					localSitelink: entity.localSitelink,
					viaTranslation: isTranslation
				};
			} );
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
			searchPath.value = null;
			searchDuration.value = null;
			return;
		}

		const startTime = performance.now();
		loading.value = true;
		error.value = null;

		try {
			// Fire a cxserver-translated search preemptively (in parallel, not after
			// a zero-result) whenever the query is in a non-Latin script, so items
			// that only have a label in the translation target language can still match.
			const wikidataSearchPromise = withRetry(
				() => searchWikidata(
					searchQuery, language.value, SEARCH_LIMIT, excludedItemTypes
				)
			);
			const translationSearchPromise = containsNonLatin( searchQuery ) ?
				searchViaTranslation( searchQuery ).catch( () => [] ) :
				Promise.resolve( [] );

			// Await only the native-language Wikidata search first
			const wikidataResults = await wikidataSearchPromise;

			// skip if the user types a new character during the search
			if ( requestId !== latestRequestId ) {
				return;
			}

			// Process native Wikidata search results first
			const processedWikidataResults = await processCandidates( wikidataResults, false );

			if ( requestId !== latestRequestId ) {
				return;
			}

			let processedTranslatedResults = [];
			let path = 'wikidata_direct';

			const MAX_RESULT = 8;
			if ( processedWikidataResults.length < MAX_RESULT ) {
				const translatedResults = await translationSearchPromise;

				if ( requestId !== latestRequestId ) {
					return;
				}

				// De-duplicate translation results by filtering out any candidates
				// that were already present in the native Wikidata search results.
				const wikidataIds = new Set( wikidataResults.map( ( r ) => r.id ) );
				const newTranslatedCandidates = translatedResults.filter(
					( r ) => !wikidataIds.has( r.id )
				);

				if ( newTranslatedCandidates.length > 0 ) {
					processedTranslatedResults = await processCandidates(
						newTranslatedCandidates,
						true
					);
				}

				if ( processedWikidataResults.length === 0 ) {
					path = processedTranslatedResults.length > 0 ?
						'mint_fallback_success' :
						'mint_fallback_no_results';
				} else if ( processedTranslatedResults.length > 0 ) {
					path = 'wikidata_and_mint';
				}
			}

			if ( requestId !== latestRequestId ) {
				return;
			}

			// Native results come first, then translated ones, each in Wikidata order
			const finalResults = processedWikidataResults.concat( processedTranslatedResults );

			results.value = finalResults;
			searchPath.value = path;
			searchDuration.value = Math.round( performance.now() - startTime );
		} catch ( err ) {
			if ( requestId !== latestRequestId ) {
				return;
			}
			error.value = err.message || 'Failed to search Wikidata';
			results.value = [];
			searchPath.value = null;
			searchDuration.value = null;
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
			searchPath.value = null;
			searchDuration.value = null;
			return;
		}

		// Show the loading state during the debounce. Otherwise the search step
		// shows "no results" before the search starts. Discard the results of
		// a search in progress, because they are for an older query.
		latestRequestId++;
		loading.value = true;

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
		searchPath,
		searchDuration,
		performSearch
	};
}

module.exports = useWikidataSearch;
