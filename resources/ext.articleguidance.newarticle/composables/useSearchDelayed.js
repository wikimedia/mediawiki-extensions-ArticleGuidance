const { useSearch } = require( './useSearch.js' );
const { ref, watch, onUnmounted } = require( 'vue' );

/**
 * Custom composable that extends useSearch with a loading delay state.
 *
 * @param {Object} query - Reactive reference to search query
 * @param {Object} language - Reactive reference to selected language
 * @param {number} [thresholdMs] Defaults to 2300 (300 ms debounce + 2000 ms wait time)
 * @return {Object} Combined search state, methods and delay
 */
function useSearchDelayed( query, language, thresholdMs = 2300 ) {
	const searchState = useSearch( query, language );

	const isDelayed = ref( false );
	let loadingTimer = null;

	watch( query, ( newQuery ) => {
		clearTimeout( loadingTimer );
		isDelayed.value = false;

		if ( newQuery && newQuery.trim().length >= 1 ) {
			loadingTimer = setTimeout( () => {
				if ( searchState.loading.value ) {
					isDelayed.value = true;
				}
			}, thresholdMs );
		}
	} );

	onUnmounted( () => {
		clearTimeout( loadingTimer );
	} );

	return Object.assign( {}, searchState, {
		isDelayed
	} );
}

module.exports = useSearchDelayed;
