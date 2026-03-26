/**
 * MediaWiki API utilities for local wiki operations
 */

/**
 * Check if a page exists on the local wiki
 *
 * @param {string} title - The page title to check
 * @return {Promise<boolean>} True if page exists, false if it doesn't
 * @throws {Error} If the API call fails
 */
async function checkPageExists( title ) {
	// Validate input
	if ( !title || typeof title !== 'string' || !title.trim() ) {
		return false;
	}

	try {
		const api = new mw.Api();
		const response = await api.get( {
			action: 'query',
			titles: title.trim(),
			formatversion: 2
		} );

		// Check if page exists by looking for 'missing' property
		// If missing is undefined, the page exists
		const page = response.query.pages[ 0 ];
		return !page.missing;
	} catch ( error ) {
		throw new Error( 'Failed to check page existence: ' + error.message );
	}
}

/**
 * Fetch the description and thumbnail for a local wiki page.
 *
 * @param {string} title Page title
 * @return {Promise<{title: string, description: string, thumbnail: string|null}>}
 */
async function fetchLocalArticleData( title ) {
	const api = new mw.Api();
	const response = await api.get( {
		action: 'query',
		titles: title,
		prop: 'pageimages|description',
		piprop: 'thumbnail',
		pithumbsize: 200,
		formatversion: 2
	} );
	const page = response.query.pages[ 0 ];
	return {
		title: page.title,
		description: page.description || '',
		thumbnail: page.thumbnail ? page.thumbnail.source : null
	};
}

module.exports = {
	checkPageExists,
	fetchLocalArticleData
};
