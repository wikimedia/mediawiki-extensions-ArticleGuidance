const { ref, watch } = require( 'vue' );
const { checkPageExists } = require( '../api/MediaWiki.js' );

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

		loading.value = true;
		error.value = null;

		try {
			const pageExists = await checkPageExists( currentTitle );
			// Only update if title hasn't changed during the async operation
			if ( title.value === currentTitle ) {
				exists.value = pageExists;
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

module.exports = useArticleExist;
