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
 * Fetch claims for multiple Wikidata entities in a single request.
 *
 * @param {string[]} qids Array of Wikidata Q IDs (e.g. ['Q42', 'Q937'])
 * @param {string[]} properties Array of property IDs to extract (e.g. ['P31', 'P171'])
 * @return {Promise<Object>} Map of qid to entity data, each with claims, imageFilename,
 *   sitelinkCount, and localSitelink for the current wiki
 */
async function fetchEntityClaims( qids, properties ) {
	if ( !qids || qids.length === 0 ) {
		return {};
	}

	const url = 'https://www.wikidata.org/w/api.php?' + new URLSearchParams( {
		action: 'wbgetentities',
		ids: qids.join( '|' ),
		props: 'claims|sitelinks/urls',
		format: 'json',
		origin: '*'
	} );

	const response = await fetch( url );
	if ( !response.ok ) {
		throw new Error( `wbgetentities request failed: ${ response.status }` );
	}

	const data = await response.json();

	if ( !data.entities ) {
		return {};
	}

	const wiki = mw.config.get( 'wgDBname' );
	const result = {};
	for ( const [ qid, entity ] of Object.entries( data.entities ) ) {
		if ( entity.missing !== undefined ) {
			continue;
		}
		const claims = {};
		for ( const prop of properties ) {
			const statements = ( entity.claims && entity.claims[ prop ] ) || [];
			claims[ prop ] = statements
				.filter( ( s ) => s.mainsnak && s.mainsnak.snaktype === 'value' &&
					s.mainsnak.datavalue && s.mainsnak.datavalue.type === 'wikibase-entityid' )
				.map( ( s ) => s.mainsnak.datavalue.value.id );
		}
		const p18Statements = ( entity.claims && entity.claims.P18 ) || [];
		const imageStatement = p18Statements.find(
			( s ) => s.mainsnak && s.mainsnak.snaktype === 'value' &&
				s.mainsnak.datavalue && s.mainsnak.datavalue.type === 'string'
		);
		let sitelinkCount = 0;
		let localSitelink = null;
		for ( const [ key, sitelink ] of Object.entries( entity.sitelinks || {} ) ) {
			if ( sitelink.url && sitelink.url.includes( 'wikipedia.org' ) ) {
				sitelinkCount++;
				if ( key === wiki ) {
					localSitelink = sitelink;
				}
			}
		}
		result[ qid ] = {
			claims,
			imageFilename: imageStatement ? imageStatement.mainsnak.datavalue.value : null,
			sitelinkCount,
			localSitelink
		};
	}

	return result;
}

module.exports = {
	searchWikidata,
	fetchEntityClaims
};
