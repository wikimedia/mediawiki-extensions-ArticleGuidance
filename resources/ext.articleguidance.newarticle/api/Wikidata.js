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

/**
 * Fetch the number of Wikipedia sitelinks for a Wikidata entity
 *
 * @param {string} qid Wikidata entity ID (e.g. Q42)
 * @return {Promise<number>} Number of Wikipedia sitelinks
 */
async function fetchSitelinkCount( qid ) {
	const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams( {
		action: 'wbgetentities',
		ids: qid,
		props: 'sitelinks/urls',
		format: 'json',
		origin: '*'
	} );
	const response = await fetch( url );
	const data = await response.json();
	const entity = data.entities && data.entities[ qid ];
	if ( !entity || !entity.sitelinks ) {
		return 0;
	}
	return Object.values( entity.sitelinks )
		.filter( ( sitelink ) => sitelink.url && sitelink.url.includes( 'wikipedia.org' ) )
		.length;
}

module.exports = {
	searchWikidata,
	fetchSitelinkCount
};
