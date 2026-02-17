const { computed } = require( 'vue' );
const useWikidataSearch = require( './useWikidataSearch.js' );
const useArticleExist = require( './useArticleExist.js' );

/**
 * Umbrella composable that combines multiple search types
 *
 * @param {Object} query - Reactive reference to search query
 * @param {Object} language - Reactive reference to selected language
 * @return {Object} Combined search state and methods
 */
function useSearch( query, language ) {
	// Initialize sub-composables
	const wikidataSearch = useWikidataSearch( query, language );
	const articleExistence = useArticleExist( query );

	// Combine loading states
	const loading = computed(
		() => wikidataSearch.loading.value || articleExistence.loading.value
	);

	// Combine error states
	const error = computed(
		() => wikidataSearch.error.value || articleExistence.error.value
	);

	return {
		// Wikidata results
		results: wikidataSearch.results,

		// Article existence
		articleExist: articleExistence.exists,

		// Combined states
		loading,
		error,

		// Methods
		performSearch: wikidataSearch.performSearch,
		checkExistence: articleExistence.checkExistence
	};
}

module.exports = {
	useSearch
};
