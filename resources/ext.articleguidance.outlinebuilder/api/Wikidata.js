/**
 * Wikidata Action API helpers for the outline builder.
 *
 * Deliberately avoids the Wikidata Query Service: enumerating P31/P279* of a
 * broad type and joining sitelinks times out. CirrusSearch (haswbstatement) and
 * wbgetentities are Elasticsearch/store-backed and fast.
 */

const { buildApiUrl } = require( 'ext.articleguidance.common' );

const WIKIDATA_QID_RE = /^Q\d+$/;

// Anonymous wbgetentities requests accept at most 50 ids per query.
const MAX_IDS_PER_REQUEST = 50;

// Sitelink badges marking article quality (used to surface outline-worthy pages).
const BADGE_FEATURED = 'Q17437796';
const BADGE_GOOD = 'Q17437798';

// P31 class of an infobox template's Wikidata item ("Wikimedia infobox
// template") — a language-agnostic way to tell a real infobox from a navbox,
// citation or maintenance template.
const INFOBOX_TEMPLATE_CLASS = 'Q19887878';

/**
 * Find items carrying a given statement, via CirrusSearch (haswbstatement).
 *
 * Results are returned in Wikidata relevance order, which is weighted by
 * sitelink and statement count — i.e. roughly by prominence, so the most
 * developed items surface first.
 *
 * @param {string} property Property ID (e.g. 'P31', 'P106')
 * @param {string} valueQId Value Q ID (the article type)
 * @param {number} limit Page size (Wikidata caps anonymous search at 50)
 * @param {number} offset Result offset for pagination (0 for the first page)
 * @return {Promise<{ ids: string[], nextOffset: (number|null) }>} A page of item
 *   Q IDs in relevance order, plus the offset of the next page (null when done)
 */
async function searchByStatement( property, valueQId, limit, offset ) {
	const params = {
		action: 'query',
		list: 'search',
		srsearch: 'haswbstatement:' + property + '=' + valueQId,
		srnamespace: '0',
		srlimit: String( limit )
	};
	if ( offset ) {
		params.sroffset = String( offset );
	}
	const response = await fetch( buildApiUrl( params ) );
	if ( !response.ok ) {
		throw new Error( 'Wikidata search failed: ' + response.status );
	}
	const data = await response.json();
	const hits = ( data.query && data.query.search ) || [];
	const ids = hits
		.map( ( hit ) => hit.title )
		.filter( ( title ) => WIKIDATA_QID_RE.test( title ) );
	const nextOffset = data.continue && data.continue.sroffset !== undefined ?
		data.continue.sroffset : null;
	return { ids: ids, nextOffset: nextOffset };
}

/**
 * For each item, resolve its sitelink to the target wiki (title, url, quality
 * badges) and the values of the requested claim properties (for specificity
 * filtering). Items without a sitelink to the target wiki are omitted.
 *
 * @param {string[]} qids Item Q IDs (at most 50 for anonymous requests)
 * @param {string} siteId Wiki ID of the target wiki (e.g. 'enwiki')
 * @param {string[]} claimProperties Properties whose entity-id values to extract
 * @return {Promise<Object>} Map of qid → { title, url, badges: string[],
 *   claims: { prop: Set } }
 */
async function fetchItemDetails( qids, siteId, claimProperties ) {
	if ( qids.length === 0 ) {
		return {};
	}
	const url = buildApiUrl( {
		action: 'wbgetentities',
		ids: qids.join( '|' ),
		props: 'sitelinks/urls|claims',
		// Only return the target wiki's sitelink, trimming the response for
		// items linked to hundreds of wikis.
		sitefilter: siteId
	} );
	const response = await fetch( url );
	if ( !response.ok ) {
		throw new Error( 'wbgetentities failed: ' + response.status );
	}
	const data = await response.json();
	const entities = data.entities || {};

	const result = {};
	qids.forEach( ( qid ) => {
		const entity = entities[ qid ];
		if ( !entity || entity.missing !== undefined ) {
			return;
		}
		const sitelink = entity.sitelinks && entity.sitelinks[ siteId ];
		if ( !sitelink ) {
			return;
		}
		const claims = {};
		claimProperties.forEach( ( prop ) => {
			const statements = ( entity.claims && entity.claims[ prop ] ) || [];
			const values = new Set();
			statements.forEach( ( statement ) => {
				const snak = statement.mainsnak;
				if ( snak && snak.snaktype === 'value' && snak.datavalue &&
					snak.datavalue.type === 'wikibase-entityid' ) {
					values.add( snak.datavalue.value.id );
				}
			} );
			claims[ prop ] = values;
		} );

		result[ qid ] = {
			title: sitelink.title,
			url: sitelink.url,
			badges: sitelink.badges || [],
			claims: claims
		};
	} );
	return result;
}

const typeClaimsCache = new Map();

/**
 * Get the claims of a type. The main category and the main template both need
 * them, so the request is shared.
 *
 * @param {string} typeQId Article type Q ID
 * @return {Promise<Object>} Map of property ID → statements
 */
function fetchTypeClaims( typeQId ) {
	if ( !typeClaimsCache.has( typeQId ) ) {
		const promise = fetch( buildApiUrl( {
			action: 'wbgetentities',
			ids: typeQId,
			props: 'claims'
		} ) ).then( ( response ) => {
			if ( !response.ok ) {
				throw new Error( 'wbgetentities failed: ' + response.status );
			}
			return response.json();
		} ).then( ( data ) => {
			const entity = data.entities && data.entities[ typeQId ];
			return ( entity && entity.claims ) || {};
		} );
		// Do not keep a failure, so that the next call tries again
		promise.catch( () => typeClaimsCache.delete( typeQId ) );
		typeClaimsCache.set( typeQId, promise );
	}
	return typeClaimsCache.get( typeQId );
}

/**
 * Resolve a type's "topic's main category" (P910) to the target wiki's
 * Category: page title — the language-native anchor for a category-tree harvest.
 *
 * Human-curated per wiki, so it avoids the pollution of the P279 subclass graph
 * (which threads unrelated items — e.g. cryptocurrencies under "book").
 *
 * @param {string} typeQId Article type Q ID (e.g. 'Q571')
 * @param {string} siteId Wiki ID of the target wiki (e.g. 'enwiki')
 * @return {Promise<string|null>} Category title (e.g. 'Catégorie:Livre'), or null
 *   when the type has no P910, or none of its categories exist on the target wiki
 */
async function fetchTypeMainCategory( typeQId, siteId ) {
	const claims = await fetchTypeClaims( typeQId );
	const statements = claims.P910 || [];
	const categoryQIds = [];
	statements.forEach( ( statement ) => {
		const snak = statement.mainsnak;
		if ( snak && snak.snaktype === 'value' && snak.datavalue &&
			snak.datavalue.type === 'wikibase-entityid' ) {
			categoryQIds.push( snak.datavalue.value.id );
		}
	} );
	if ( categoryQIds.length === 0 ) {
		return null;
	}

	const catResponse = await fetch( buildApiUrl( {
		action: 'wbgetentities',
		ids: categoryQIds.join( '|' ),
		props: 'sitelinks',
		sitefilter: siteId
	} ) );
	if ( !catResponse.ok ) {
		throw new Error( 'wbgetentities failed: ' + catResponse.status );
	}
	const catData = await catResponse.json();
	const catEntities = catData.entities || {};
	// Preserve the statement order (the primary main category first).
	let found = null;
	categoryQIds.some( ( qid ) => {
		const catEntity = catEntities[ qid ];
		const sitelink = catEntity && catEntity.sitelinks && catEntity.sitelinks[ siteId ];
		if ( sitelink && sitelink.title ) {
			found = sitelink.title;
			return true;
		}
		return false;
	} );
	return found;
}

/**
 * Resolve a type's "topic's main template" (P1424) to the target wiki's infobox
 * template title. Only P1424 values that are actually infobox templates (P31 =
 * INFOBOX_TEMPLATE_CLASS) and exist on the target wiki are considered, so a
 * navbox or citation template linked under P1424 is ignored.
 *
 * @param {string} typeQId Article type Q ID
 * @param {string} siteId Wiki ID of the target wiki (e.g. 'enwiki')
 * @return {Promise<string|null>} Template title (e.g. 'Modèle:Infobox Cinéma
 *   (film)'), or null when the type has no infobox linked via P1424
 */
async function fetchTypeMainTemplate( typeQId, siteId ) {
	const claims = await fetchTypeClaims( typeQId );
	const statements = claims.P1424 || [];
	const templateQIds = [];
	statements.forEach( ( statement ) => {
		const snak = statement.mainsnak;
		if ( snak && snak.snaktype === 'value' && snak.datavalue &&
			snak.datavalue.type === 'wikibase-entityid' ) {
			templateQIds.push( snak.datavalue.value.id );
		}
	} );
	if ( templateQIds.length === 0 ) {
		return null;
	}

	const tplResponse = await fetch( buildApiUrl( {
		action: 'wbgetentities',
		ids: templateQIds.join( '|' ),
		props: 'claims|sitelinks',
		sitefilter: siteId
	} ) );
	if ( !tplResponse.ok ) {
		throw new Error( 'wbgetentities failed: ' + tplResponse.status );
	}
	const tplData = await tplResponse.json();
	const tplEntities = tplData.entities || {};
	let found = null;
	templateQIds.some( ( qid ) => {
		const tplEntity = tplEntities[ qid ];
		if ( !tplEntity ) {
			return false;
		}
		const instanceOf = ( tplEntity.claims && tplEntity.claims.P31 ) || [];
		const isInfobox = instanceOf.some( ( statement ) => {
			const snak = statement.mainsnak;
			return snak && snak.datavalue && snak.datavalue.type === 'wikibase-entityid' &&
				snak.datavalue.value.id === INFOBOX_TEMPLATE_CLASS;
		} );
		const sitelink = tplEntity.sitelinks && tplEntity.sitelinks[ siteId ];
		if ( isInfobox && sitelink && sitelink.title ) {
			found = sitelink.title;
			return true;
		}
		return false;
	} );
	return found;
}

/**
 * For each item, report its "instance of" (P31) value Q IDs. Used to tell which
 * of a set of template items are infoboxes.
 *
 * @param {string[]} qids Item Q IDs (at most 50 for anonymous requests)
 * @return {Promise<Object>} Map of qid → Set of P31 value Q IDs
 */
async function fetchInstanceOf( qids ) {
	if ( qids.length === 0 ) {
		return {};
	}
	const response = await fetch( buildApiUrl( {
		action: 'wbgetentities',
		ids: qids.join( '|' ),
		props: 'claims'
	} ) );
	if ( !response.ok ) {
		throw new Error( 'wbgetentities failed: ' + response.status );
	}
	const data = await response.json();
	const entities = data.entities || {};
	const result = {};
	qids.forEach( ( qid ) => {
		const entity = entities[ qid ];
		const statements = ( entity && entity.claims && entity.claims.P31 ) || [];
		const values = new Set();
		statements.forEach( ( statement ) => {
			const snak = statement.mainsnak;
			if ( snak && snak.snaktype === 'value' && snak.datavalue &&
				snak.datavalue.type === 'wikibase-entityid' ) {
				values.add( snak.datavalue.value.id );
			}
		} );
		result[ qid ] = values;
	} );
	return result;
}

/**
 * Fetch the quality badges of one batch (≤50) of items' sitelinks to the target
 * wiki.
 *
 * @param {string[]} qids Wikidata item Q IDs (≤50)
 * @param {string} siteId Wiki ID of the target wiki (e.g. 'enwiki')
 * @return {Promise<Object>} Map of Q ID → badge Q IDs
 */
async function fetchItemsBadgesChunk( qids, siteId ) {
	const url = buildApiUrl( {
		action: 'wbgetentities',
		ids: qids.join( '|' ),
		props: 'sitelinks',
		sitefilter: siteId
	} );
	const response = await fetch( url );
	if ( !response.ok ) {
		throw new Error( 'wbgetentities failed: ' + response.status );
	}
	const data = await response.json();
	const entities = data.entities || {};
	const badges = {};
	qids.forEach( ( qid ) => {
		const entity = entities[ qid ];
		const sitelink = entity && entity.sitelinks && entity.sitelinks[ siteId ];
		badges[ qid ] = sitelink && sitelink.badges ? sitelink.badges : [];
	} );
	return badges;
}

/**
 * Fetch the quality badges of each item's sitelink to the target wiki. Used to
 * fill the quality column for articles added outside the search path. Q IDs are
 * chunked into batches of 50 (run in parallel) so arbitrarily many can be
 * requested.
 *
 * @param {string[]} qids Wikidata item Q IDs
 * @param {string} siteId Wiki ID of the target wiki (e.g. 'enwiki')
 * @return {Promise<Object>} Map of Q ID → badge Q IDs (empty array when none)
 */
async function fetchItemsBadges( qids, siteId ) {
	if ( qids.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < qids.length; i += MAX_IDS_PER_REQUEST ) {
		chunks.push( qids.slice( i, i + MAX_IDS_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchItemsBadgesChunk( chunk, siteId ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( qid ) => {
			merged[ qid ] = map[ qid ];
		} );
	} );
	return merged;
}

/**
 * Search Wikidata items by label or alias, for autocomplete.
 *
 * @param {string} query Search text
 * @param {string} language Language of the labels and descriptions
 * @param {number} limit Maximum number of results
 * @return {Promise<Array<{id: string, label: string, description: string}>>}
 */
async function searchItems( query, language, limit ) {
	const response = await fetch( buildApiUrl( {
		action: 'wbsearchentities',
		search: query,
		type: 'item',
		language: language,
		uselang: language,
		limit: String( limit )
	} ) );
	if ( !response.ok ) {
		throw new Error( 'Wikidata search failed: ' + response.status );
	}
	const data = await response.json();
	return ( data.search || [] ).map( ( item ) => ( {
		id: item.id,
		label: item.label || item.id,
		description: item.description || ''
	} ) );
}

module.exports = {
	searchByStatement,
	fetchItemDetails,
	fetchItemsBadges,
	fetchTypeMainCategory,
	fetchTypeMainTemplate,
	fetchInstanceOf,
	searchItems,
	INFOBOX_TEMPLATE_CLASS,
	BADGE_FEATURED,
	BADGE_GOOD
};
