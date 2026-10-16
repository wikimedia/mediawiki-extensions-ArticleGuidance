const { ref, watch } = require( 'vue' );
const { checkPagesExist } = require( '../api/MediaWiki.js' );
const { withRetry } = require( '../utils/retry.js' );

// Page-scoped cache: cleared automatically on page reload, and by clearExistenceCache().
// Key: title, Value: whether the page exists
const existenceCache = new Map();

/**
 * Forget the cached existence of all titles, after the workflow creates a page.
 */
function clearExistenceCache() {
	existenceCache.clear();
}

/**
 * Check which titles exist on the local wiki. Only the titles that are not
 * in the cache are requested, in one request.
 *
 * @param {string[]} titles Titles to check
 * @return {Promise<Object>} Whether each title exists, keyed by title
 */
async function checkTitlesExist( titles ) {
	const uncachedTitles = titles.filter( ( title ) => !existenceCache.has( title ) );
	if ( uncachedTitles.length > 0 ) {
		const existenceMap = await checkPagesExist( uncachedTitles );
		uncachedTitles.forEach( ( title ) => {
			existenceCache.set( title, !!existenceMap[ title ] );
		} );
	}
	const result = {};
	titles.forEach( ( title ) => {
		result[ title ] = existenceCache.get( title );
	} );
	return result;
}

/**
 * Composable for checking if an article exists on the local wiki
 *
 * @param {Object} title - Reactive reference to article title
 * @return {Object} Article existence state and methods
 */
function useArticleExist( title ) {
	const exists = ref( null );
	const loading = ref( false );
	const error = ref( null );

	let debounceTimer = null;

	/**
	 * Check if the article exists
	 */
	async function checkExistence() {
		const currentTitle = title.value;

		// Reset to null if title is empty
		if ( !currentTitle || !currentTitle.trim() ) {
			exists.value = null;
			loading.value = false;
			error.value = null;
			return;
		}

		if ( existenceCache.has( currentTitle ) ) {
			exists.value = existenceCache.get( currentTitle );
			loading.value = false;
			error.value = null;
			return;
		}

		loading.value = true;
		error.value = null;

		try {
			const existenceMap = await withRetry( () => checkPagesExist( [ currentTitle ] ) );
			existenceCache.set( currentTitle, existenceMap[ currentTitle ] );
			// Only update if title hasn't changed during the async operation
			if ( title.value === currentTitle ) {
				exists.value = existenceMap[ currentTitle ];
			}
		} catch ( err ) {
			if ( title.value === currentTitle ) {
				error.value = err.message;
				exists.value = null;
			}
		} finally {
			if ( title.value === currentTitle ) {
				loading.value = false;
			}
		}
	}

	// Watch title changes with debouncing
	watch( title, () => {
		// Clear existing timer
		if ( debounceTimer ) {
			clearTimeout( debounceTimer );
		}

		// Reset to null immediately when title changes
		exists.value = null;

		// If title is empty, don't start a new check
		if ( !title.value || !title.value.trim() ) {
			loading.value = false;
			error.value = null;
			return;
		}

		// Set new debounce timer (300ms)
		debounceTimer = setTimeout( () => {
			checkExistence();
		}, 300 );
	} );

	return {
		exists,
		loading,
		error,
		checkExistence
	};
}

module.exports = { useArticleExist, checkTitlesExist, clearExistenceCache };
