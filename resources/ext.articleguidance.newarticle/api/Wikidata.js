/**
 * Search Wikidata entities
 *
 * @param {string} query Search query
 * @param {string} language Language code
 * @param {number} limit Maximum number of results (default: 10)
 * @return {Promise<Array>} Array of Wikidata entities
 */
async function searchWikidata( query, language, limit = 20 ) {
	if ( !query || query.trim().length === 0 ) {
		return [];
	}

	const searchUrl = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams( {
		action: 'wbsearchentities',
		type: 'item',
		search: query.trim(),
		language: language,
		uselang: language,
		limit: limit.toString(),
		format: 'json',
		origin: '*'
	} );

	try {
		const searchResponse = await fetch( searchUrl );

		if ( !searchResponse.ok ) {
			throw new Error( `HTTP error! status: ${ searchResponse.status }` );
		}

		const searchData = await searchResponse.json();

		if ( !searchData.search || !Array.isArray( searchData.search ) ) {
			return [];
		}

		return searchData.search.map( ( item ) => ( {
			id: item.id,
			label: item.label || item.id,
			description: item.description || '',
			url: item.concepturi || `https://www.wikidata.org/wiki/${ item.id }`
		} ) );
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Wikidata search error:', error );
		throw new Error( 'Failed to search Wikidata: ' + error.message );
	}
}

module.exports = {
	searchWikidata
};
