const { ref } = require( 'vue' );
const { fetchOutlines } = require( '../api/Outlines.js' );

// Module-level state to cache outlines across all component instances
const outlinesCache = ref( null );
const isLoading = ref( false );
const error = ref( null );

/**
 * Composable for managing outlines with caching
 * Fetches outlines only once on first access and caches the result
 *
 * @return {Object} Object containing getOutlines method and reactive state
 */
function useOutlines() {
	/**
	 * Get outlines, fetching from API only if not already cached
	 *
	 * @return {Promise<Array>} Array of outline objects
	 */
	const getOutlines = async () => {
		// Return cached data if available
		if ( outlinesCache.value !== null ) {
			return outlinesCache.value;
		}

		// Don't fetch if already loading
		if ( isLoading.value ) {
			// Wait for current fetch to complete
			return new Promise( ( resolve, reject ) => {
				const checkInterval = setInterval( () => {
					if ( !isLoading.value ) {
						clearInterval( checkInterval );
						if ( error.value ) {
							reject( error.value );
						} else {
							resolve( outlinesCache.value );
						}
					}
				}, 50 );
			} );
		}

		// Fetch from API
		isLoading.value = true;
		error.value = null;

		try {
			const outlines = await fetchOutlines();
			outlinesCache.value = outlines;
			return outlines;
		} catch ( err ) {
			error.value = err;
			throw err;
		} finally {
			isLoading.value = false;
		}
	};

	return {
		getOutlines,
		isLoading,
		error
	};
}

module.exports = {
	useOutlines
};
