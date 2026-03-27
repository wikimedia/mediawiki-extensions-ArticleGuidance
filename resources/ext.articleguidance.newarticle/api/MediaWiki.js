/**
 * MediaWiki API utilities for local wiki operations
 */

/**
 * Check if multiple pages exist on the local wiki in a single API call.
 *
 * @param {string[]} titles - Page titles to check
 * @return {Promise<Object>} Map of input title → boolean existence
 * @throws {Error} If the API call fails
 */
async function checkPagesExist( titles ) {
	if ( !titles ) {
		return {};
	}

	titles = titles.map( ( t ) => t.trim() ).filter( Boolean );
	if ( titles.length === 0 ) {
		return {};
	}

	try {
		const api = new mw.Api();
		const response = await api.get( {
			action: 'query',
			titles: titles.join( '|' ),
			formatversion: 2
		} );

		// Build normalization map from input title to canonical title
		const normalMap = {};
		if ( response.query.normalized ) {
			for ( let i = 0; i < response.query.normalized.length; i++ ) {
				const n = response.query.normalized[ i ];
				normalMap[ n.from ] = n.to;
			}
		}

		// Collect existing page titles
		const existingTitles = {};
		for ( let i = 0; i < response.query.pages.length; i++ ) {
			const page = response.query.pages[ i ];
			if ( !page.missing ) {
				existingTitles[ page.title ] = true;
			}
		}

		// Map each input title to its existence status
		const result = {};
		for ( let i = 0; i < titles.length; i++ ) {
			const title = titles[ i ];
			const canonical = normalMap[ title ] || title;
			result[ title ] = !!existingTitles[ canonical ];
		}
		return result;
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
	checkPagesExist,
	fetchLocalArticleData
};
