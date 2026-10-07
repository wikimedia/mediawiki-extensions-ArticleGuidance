const { buildApiUrl, getPageUrl } = require( '../utils/wikidata.js' );
const { getPageNamespaces } = require( './MediaWiki.js' );

const NS_MAIN = 0;

// Page-scoped cache: cleared automatically on page reload. It keeps every item-valued
// claim, so outline matching of a search result reads the claims from it.
// Key: qid, Value: entity data object (claims, label, description, imageFilename, sitelinkCount,
//   localSitelink, localSitelinkOutsideMainNamespace)
const entityClaimsCache = new Map();

// Page-scoped cache: cleared automatically on page reload. A search runs again
// when the user goes back to the search step.
// Key: search request URL, Value: search results
const searchCache = new Map();

/**
 * Search Wikidata entities using the MediaWiki full-text search API (CirrusSearch),
 * which matches labels, aliases, and descriptions — the same backend as Wikidata.org.
 *
 * @param {string} query Search query
 * @param {string} language Language code
 * @param {number} limit Maximum number of results (default: 20)
 * @param {string[]} excludedTypes Q IDs of the P31 values to exclude from the results
 * @return {Promise<Array>} Array of Wikidata entities with id, label, description, url
 */
async function searchWikidata( query, language, limit = 20, excludedTypes = [] ) {
	if ( !query || query.trim().length === 0 ) {
		return [];
	}

	const searchUrl = buildApiUrl( {
		action: 'query',
		list: 'search',
		// The search backend applies the exclusions, so that every result is usable
		srsearch: [ query.trim() ].concat(
			excludedTypes.map( ( qid ) => '-haswbstatement:P31=' + qid )
		).join( ' ' ),
		srnamespace: NS_MAIN,
		srlimit: limit.toString(),
		uselang: language
	} );
	if ( searchCache.has( searchUrl ) ) {
		return searchCache.get( searchUrl );
	}

	try {
		const searchResponse = await fetch( searchUrl );

		if ( !searchResponse.ok ) {
			throw new Error( `HTTP error! status: ${ searchResponse.status }` );
		}

		const searchData = await searchResponse.json();

		if ( !searchData.query || !Array.isArray( searchData.query.search ) ) {
			return [];
		}

		const results = searchData.query.search
			.filter( ( item ) => /^Q\d+$/.test( item.title ) )
			.map( ( item ) => ( {
				id: item.title,
				label: item.title,
				description: '',
				url: getPageUrl( item.title )
			} ) );
		searchCache.set( searchUrl, results );
		return results;
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Wikidata search error:', error );
		throw new Error( 'Failed to search Wikidata: ' + error.message );
	}
}

/**
 * Fetch claims, labels, and descriptions for multiple Wikidata entities in a single request.
 *
 * @param {string[]} qids Array of Wikidata Q IDs (e.g. ['Q42', 'Q937'])
 * @param {string} language Language code for labels and descriptions
 * @return {Promise<Object>} Map of qid to entity data, each with claims (property ID to the
 *   item Q IDs it links to), label, hasLabel, description, imageFilename, sitelinkCount,
 *   localSitelink for the current wiki (null if none, or if the only local sitelink is outside
 *   the Main namespace), and localSitelinkOutsideMainNamespace
 */
async function fetchEntityClaims( qids, language ) {
	if ( !qids || qids.length === 0 ) {
		return {};
	}

	const cachedResult = {};
	const uncachedQIds = [];

	qids.forEach( ( qid ) => {
		if ( entityClaimsCache.has( qid ) ) {
			cachedResult[ qid ] = entityClaimsCache.get( qid );
		} else {
			uncachedQIds.push( qid );
		}
	} );

	if ( uncachedQIds.length === 0 ) {
		return cachedResult;
	}

	const url = buildApiUrl( {
		action: 'wbgetentities',
		ids: uncachedQIds.join( '|' ),
		props: 'claims|sitelinks/urls|labels|descriptions',
		languages: language,
		languagefallback: '1'
	} );

	const response = await fetch( url );
	if ( !response.ok ) {
		throw new Error( `wbgetentities request failed: ${ response.status }` );
	}

	const data = await response.json();

	if ( !data.entities ) {
		return cachedResult;
	}

	const wiki = mw.config.get( 'wgDBname' );

	// Gather each candidate's local-wiki sitelink up front, so all of them can be
	// resolved to a namespace in a single batched API call.
	const localSitelinkByQid = {};
	for ( const [ qid, entity ] of Object.entries( data.entities ) ) {
		const sitelink = ( entity.sitelinks || {} )[ wiki ];
		if ( sitelink && sitelink.url && sitelink.url.includes( 'wikipedia.org' ) ) {
			localSitelinkByQid[ qid ] = sitelink;
		}
	}
	const namespaceByTitle = await getPageNamespaces(
		Object.values( localSitelinkByQid ).map( ( sitelink ) => sitelink.title )
	);

	const freshResult = {};
	for ( const [ qid, entity ] of Object.entries( data.entities ) ) {
		if ( entity.missing !== undefined ) {
			continue;
		}
		const claims = {};
		for ( const [ prop, statements ] of Object.entries( entity.claims || {} ) ) {
			const values = statements
				.filter( ( s ) => s.mainsnak && s.mainsnak.snaktype === 'value' &&
					s.mainsnak.datavalue && s.mainsnak.datavalue.type === 'wikibase-entityid' )
				.map( ( s ) => s.mainsnak.datavalue.value.id );
			if ( values.length > 0 ) {
				claims[ prop ] = values;
			}
		}
		const p18Statements = ( entity.claims && entity.claims.P18 ) || [];
		const imageStatement = p18Statements.find(
			( s ) => s.mainsnak && s.mainsnak.snaktype === 'value' &&
				s.mainsnak.datavalue && s.mainsnak.datavalue.type === 'string'
		);
		const sitelinkCount = Object.values( entity.sitelinks || {} )
			.filter( ( sitelink ) => sitelink.url && sitelink.url.includes( 'wikipedia.org' ) )
			.length;
		const localSitelink = localSitelinkByQid[ qid ];
		const isLocalSitelinkMain = !!localSitelink &&
			namespaceByTitle[ localSitelink.title ] === NS_MAIN;
		const labelEntry = entity.labels && entity.labels[ language ];
		const descEntry = entity.descriptions && entity.descriptions[ language ];
		const labelFallback = !!labelEntry &&
			labelEntry.language !== language &&
			labelEntry.language !== 'mul';
		freshResult[ qid ] = {
			claims,
			label: labelEntry ? labelEntry.value : qid,
			hasLabel: !!labelEntry,
			labelFallback,
			description: descEntry ? descEntry.value : '',
			imageFilename: imageStatement ? imageStatement.mainsnak.datavalue.value : null,
			sitelinkCount,
			localSitelink: isLocalSitelinkMain ? localSitelink : null,
			localSitelinkOutsideMainNamespace: !!localSitelink && !isLocalSitelinkMain
		};
		entityClaimsCache.set( qid, freshResult[ qid ] );
	}

	return Object.assign( {}, cachedResult, freshResult );
}

module.exports = {
	searchWikidata,
	fetchEntityClaims
};
