/**
 * Action API helpers for the source wiki: the wiki that example articles come from.
 * It is the local wiki, or the wiki of ArticleGuidanceOutlineBuilderSourceApi.
 */

const sourceApiUrl = require( '../config.json' ).ArticleGuidanceOutlineBuilderSourceApi;

// Namespace ID of categories
const NS_CATEGORY = 14;

let api = null;
let siteInfoPromise = null;

/**
 * @return {mw.Api} API of the source wiki
 */
function getApi() {
	if ( api === null ) {
		// Anonymous requests read another wiki without a CORS allowlist
		api = sourceApiUrl ?
			new mw.ForeignApi( sourceApiUrl, { anonymous: true } ) :
			new mw.Api();
	}
	return api;
}

/**
 * @return {Promise<{siteId: string, categoryNames: string[]}>} Wiki ID of the
 *   source wiki (e.g. 'enwiki'), the key of its Wikidata sitelinks, and all the
 *   names of its category namespace
 */
function getSiteInfo() {
	if ( siteInfoPromise === null ) {
		siteInfoPromise = Promise.resolve( getApi().get( {
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general|namespaces|namespacealiases'
		} ) ).then(
			( data ) => {
				const namespace = data.query.namespaces[ NS_CATEGORY ];
				const categoryNames = [ namespace[ '*' ], namespace.canonical ];
				data.query.namespacealiases.forEach( ( alias ) => {
					if ( alias.id === NS_CATEGORY ) {
						categoryNames.push( alias[ '*' ] );
					}
				} );
				return { siteId: data.query.general.wikiid, categoryNames: categoryNames };
			},
			( error ) => {
				// Try again on the next call
				siteInfoPromise = null;
				throw error;
			}
		);
	}
	return siteInfoPromise;
}

/**
 * @return {Promise<string>} Wiki ID of the source wiki (e.g. 'enwiki'), the key
 *   of its Wikidata sitelinks
 */
function getSiteId() {
	return getSiteInfo().then( ( info ) => info.siteId );
}

/**
 * @return {Promise<string[]>} Names of the category namespace of the source
 *   wiki: local, canonical and aliases
 */
function getCategoryNames() {
	return getSiteInfo().then( ( info ) => info.categoryNames );
}

/**
 * Run a query on page properties, and follow the continuation. A response has a
 * size limit, so the data of some pages (e.g. the content of long articles) can
 * come in later responses. The arrays of a page (e.g. its templates) are merged.
 *
 * @param {Object} params Query parameters
 * @return {Promise<Object>} Pages by page ID
 */
async function queryPages( params ) {
	const pages = {};
	let continuation = {};
	while ( continuation ) {
		const data = await getApi().get( Object.assign( {}, params, continuation ) );
		const batch = ( data.query && data.query.pages ) || {};
		Object.keys( batch ).forEach( ( pageId ) => {
			const page = pages[ pageId ] || {};
			Object.keys( batch[ pageId ] ).forEach( ( key ) => {
				const value = batch[ pageId ][ key ];
				page[ key ] = Array.isArray( value ) && Array.isArray( page[ key ] ) ?
					page[ key ].concat( value ) :
					value;
			} );
			pages[ pageId ] = page;
		} );
		continuation = data.continue || null;
	}
	return pages;
}

/**
 * Count reference tags in wikitext. Matches <ref>, <ref name=…> and <ref />,
 * without matching the <references /> list tag. An approximation (list-defined
 * and template-only citations vary), good enough as a structural signal.
 *
 * @param {string} wikitext
 * @return {number}
 */
function countReferences( wikitext ) {
	const matches = wikitext.match( /<ref(\s|>|\/)/gi );
	return matches ? matches.length : 0;
}

/**
 * Count sections in wikitext: every level-2+ heading, plus 1 for the lead
 * section (the intro prose before the first heading), which every article with
 * content has even when it has no headings. Empty wikitext counts as 0 (no lead
 * to add).
 *
 * @param {string} wikitext
 * @return {number}
 */
function countSections( wikitext ) {
	if ( wikitext.trim() === '' ) {
		return 0;
	}
	const matches = wikitext.match( /^={2,}.+?={2,}[ \t]*$/gm );
	return ( matches ? matches.length : 0 ) + 1;
}

// Anonymous requests accept at most 50 titles per query.
const MAX_TITLES_PER_REQUEST = 50;

// Anonymous list=search requests accept at most 50 results per query.
const MAX_SEARCH_LIMIT = 50;

/**
 * Fetch size and structural characteristics for the given titles on the source
 * wiki: page byte length plus reference and section counts derived from the
 * current wikitext. Titles are chunked into batches of 50 (run in parallel) so
 * arbitrarily many can be requested.
 *
 * @param {string[]} titles Article titles
 * @return {Promise<Object>} Map of title → { isArticle, size, references, sections, lastUpdated }
 */
async function fetchPageDetails( titles ) {
	if ( titles.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < titles.length; i += MAX_TITLES_PER_REQUEST ) {
		chunks.push( titles.slice( i, i + MAX_TITLES_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchPageDetailsChunk( chunk ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( title ) => {
			merged[ title ] = map[ title ];
		} );
	} );
	return merged;
}

/**
 * Fetch the raw current wikitext of a single batch of at most 50 titles.
 *
 * @param {string[]} titles Article titles (at most 50)
 * @return {Promise<Object>} Map of title → wikitext
 */
async function fetchWikitextChunk( titles ) {
	const params = {
		action: 'query',
		prop: 'revisions',
		rvprop: 'content',
		rvslots: 'main',
		titles: titles.join( '|' )
	};
	const pages = await queryPages( params );
	const result = {};
	Object.keys( pages ).forEach( ( pageId ) => {
		const page = pages[ pageId ];
		if ( page.title === undefined ) {
			return;
		}
		const revisions = page.revisions || [];
		let wikitext = '';
		if ( revisions.length > 0 ) {
			const main = revisions[ 0 ].slots && revisions[ 0 ].slots.main;
			if ( main ) {
				wikitext = main.content !== undefined ? main.content : ( main[ '*' ] || '' );
			}
		}
		result[ page.title ] = wikitext;
	} );
	return result;
}

/**
 * Fetch the raw current wikitext for the given titles, chunked into batches of
 * 50 (run in parallel). Powers the outline generator, which parses
 * sections, infobox fields, categories and citation domains out of the wikitext.
 *
 * @param {string[]} titles Article titles
 * @return {Promise<Object>} Map of title → wikitext
 */
async function fetchWikitext( titles ) {
	if ( titles.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < titles.length; i += MAX_TITLES_PER_REQUEST ) {
		chunks.push( titles.slice( i, i + MAX_TITLES_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchWikitextChunk( chunk ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( title ) => {
			merged[ title ] = map[ title ];
		} );
	} );
	return merged;
}

/**
 * Fetch page details for a single batch of at most 50 titles.
 *
 * @param {string[]} titles Article titles (at most 50)
 * @return {Promise<Object>} Map of title → { isArticle, size, references, sections, lastUpdated }
 */
async function fetchPageDetailsChunk( titles ) {
	const params = {
		action: 'query',
		prop: 'info|revisions|pageprops',
		ppprop: 'wikibase_item',
		rvprop: 'content|timestamp',
		rvslots: 'main',
		titles: titles.join( '|' )
	};
	const pages = await queryPages( params );

	const details = {};
	Object.keys( pages ).forEach( ( pageId ) => {
		const page = pages[ pageId ];
		if ( page.title === undefined ) {
			return;
		}
		const revisions = page.revisions || [];
		let wikitext = '';
		let lastUpdated = null;
		if ( revisions.length > 0 ) {
			const revision = revisions[ 0 ];
			lastUpdated = revision.timestamp || null;
			const main = revision.slots && revision.slots.main;
			if ( main ) {
				wikitext = main.content !== undefined ? main.content : ( main[ '*' ] || '' );
			}
		}
		// A real article: not a redirect, not missing, and has content.
		const isArticle = page.redirect === undefined &&
			page.missing === undefined &&
			wikitext.trim() !== '';
		const pageProps = page.pageprops || {};
		details[ page.title ] = {
			isArticle: isArticle,
			wikibaseItem: pageProps.wikibase_item || null,
			size: page.length !== undefined ? page.length : null,
			references: countReferences( wikitext ),
			sections: countSections( wikitext ),
			lastUpdated: lastUpdated
		};
	} );
	return details;
}

/**
 * Prefix-search article titles on the source wiki, for autocomplete.
 *
 * @param {string} term Search term
 * @param {number} limit Maximum suggestions
 * @return {Promise<string[]>} Matching article titles
 */
async function searchArticles( term, limit ) {
	if ( !term ) {
		return [];
	}
	const params = {
		action: 'query',
		list: 'prefixsearch',
		pssearch: term,
		pslimit: String( limit )
	};
	const data = await getApi().get( params );
	const hits = ( data.query && data.query.prefixsearch ) || [];
	return hits.map( ( hit ) => hit.title );
}

/**
 * Prefix-search category titles on the source wiki, for autocomplete.
 * Titles come back with their localized namespace prefix.
 *
 * @param {string} term Search term, with or without the namespace prefix
 * @param {number} limit Maximum suggestions
 * @return {Promise<string[]>} Matching category titles
 */
async function searchCategories( term, limit ) {
	if ( !term ) {
		return [];
	}
	const params = {
		action: 'query',
		list: 'prefixsearch',
		pssearch: term,
		psnamespace: '14',
		pslimit: String( limit )
	};
	const data = await getApi().get( params );
	const hits = ( data.query && data.query.prefixsearch ) || [];
	return hits.map( ( hit ) => hit.title );
}

/**
 * Build the URL of an article on the source wiki.
 *
 * @param {string} title Article title
 * @return {string}
 */
function articleUrl( title ) {
	if ( !sourceApiUrl ) {
		return mw.util.getUrl( title );
	}
	// index.php is next to api.php, whatever the article path of the wiki is
	return sourceApiUrl.replace( /api\.php$/, 'index.php' ) +
		'?title=' + mw.util.wikiUrlencode( title );
}

/**
 * Fetch the member counts of each category (one batch of ≤50): how many direct
 * members are articles (`pages`) vs subcategories (`subcats`). The split lets a
 * category-tree walk tell harvestable leaves (many articles) from organizational
 * buckets (mostly subcategories).
 *
 * @param {string[]} categoryTitles Category titles (≤50)
 * @return {Promise<Object>} Map of category title → { pages, subcats }
 */
async function fetchCategoryInfoChunk( categoryTitles ) {
	const params = {
		action: 'query',
		prop: 'categoryinfo',
		titles: categoryTitles.join( '|' )
	};
	const pages = await queryPages( params );
	const infos = {};
	Object.keys( pages ).forEach( ( pageId ) => {
		const page = pages[ pageId ];
		if ( page.title !== undefined ) {
			const info = page.categoryinfo;
			infos[ page.title ] = {
				pages: info && info.pages !== undefined ? info.pages : 0,
				subcats: info && info.subcats !== undefined ? info.subcats : 0
			};
		}
	} );
	return infos;
}

/**
 * Fetch the member counts of each category.
 *
 * @param {string[]} categoryTitles Category titles
 * @return {Promise<Object>} Map of category title → { pages, subcats }
 */
async function fetchCategoryInfo( categoryTitles ) {
	if ( categoryTitles.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < categoryTitles.length; i += MAX_TITLES_PER_REQUEST ) {
		chunks.push( categoryTitles.slice( i, i + MAX_TITLES_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchCategoryInfoChunk( chunk ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( title ) => {
			merged[ title ] = map[ title ];
		} );
	} );
	return merged;
}

/**
 * Fetch the direct subcategories of a category.
 *
 * @param {string} categoryTitle Category title (with namespace prefix)
 * @param {number} limit Maximum subcategories
 * @return {Promise<string[]>} Subcategory titles
 */
async function fetchSubcategories( categoryTitle, limit ) {
	const params = {
		action: 'query',
		list: 'categorymembers',
		cmtitle: categoryTitle,
		cmtype: 'subcat',
		cmlimit: String( limit )
	};
	const data = await getApi().get( params );
	const members = ( data.query && data.query.categorymembers ) || [];
	return members.map( ( member ) => member.title );
}

/**
 * Search the article-namespace members of a category, ranked by the wiki's
 * default relevance — which folds in CirrusSearch's pageview-derived
 * `popularity_score`. So the most-read members surface first, without any
 * pageviews API call. `incategory` is non-recursive (direct members only), which
 * keeps it precise (no subcategory-tree leakage).
 *
 * @param {string} categoryTitle Category title (with or without the namespace prefix)
 * @param {number} limit Maximum members (anonymous search caps at 50)
 * @return {Promise<string[]>} Member article titles, most popular first
 */
async function searchInCategory( categoryTitle, limit ) {
	// incategory: takes the category name without its (localized) namespace prefix.
	const name = categoryTitle.replace( /^[^:]+:/, '' );
	const params = {
		action: 'query',
		list: 'search',
		srsearch: 'incategory:"' + name + '"',
		srnamespace: '0',
		srlimit: String( Math.min( limit, MAX_SEARCH_LIMIT ) )
	};
	const data = await getApi().get( params );
	const hits = ( data.query && data.query.search ) || [];
	return hits.map( ( hit ) => hit.title );
}

/**
 * Search articles that transclude a given template, ranked by the wiki's default
 * relevance (which folds in CirrusSearch's pageview-derived popularity). Since a
 * type's infobox template is a human-maintained, unambiguous type marker, this
 * surfaces the most-developed articles of the type, language-native, in one call.
 *
 * @param {string} templateName Template name (with or without namespace prefix)
 * @param {number} limit Maximum results (anonymous search caps at 50)
 * @return {Promise<string[]>} Article titles, most popular first
 */
async function searchByTemplate( templateName, limit ) {
	// hastemplate: takes the template name without its (localized) namespace prefix.
	const name = templateName.replace( /^[^:]+:/, '' );
	const params = {
		action: 'query',
		list: 'search',
		srsearch: 'hastemplate:"' + name + '"',
		srnamespace: '0',
		srlimit: String( Math.min( limit, MAX_SEARCH_LIMIT ) )
	};
	const data = await getApi().get( params );
	const hits = ( data.query && data.query.search ) || [];
	return hits.map( ( hit ) => hit.title );
}

/**
 * Fetch the transcluded templates (namespace 10) of each article (one batch of
 * ≤50).
 *
 * @param {string[]} titles Article titles (≤50)
 * @return {Promise<Object>} Map of article title → template titles
 */
async function fetchArticleTemplatesChunk( titles ) {
	const params = {
		action: 'query',
		prop: 'templates',
		tlnamespace: '10',
		tllimit: '500',
		titles: titles.join( '|' )
	};
	const pages = await queryPages( params );
	const map = {};
	Object.keys( pages ).forEach( ( pageId ) => {
		const page = pages[ pageId ];
		if ( page.title !== undefined ) {
			map[ page.title ] = ( page.templates || [] ).map( ( template ) => template.title );
		}
	} );
	return map;
}

/**
 * Fetch the transcluded templates (namespace 10) of each article.
 *
 * @param {string[]} titles Article titles
 * @return {Promise<Object>} Map of article title → template titles
 */
async function fetchArticleTemplates( titles ) {
	if ( titles.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < titles.length; i += MAX_TITLES_PER_REQUEST ) {
		chunks.push( titles.slice( i, i + MAX_TITLES_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchArticleTemplatesChunk( chunk ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( title ) => {
			merged[ title ] = map[ title ];
		} );
	} );
	return merged;
}

/**
 * Resolve article titles to their Wikidata item Q IDs (one batch of ≤50).
 *
 * @param {string[]} titles Article titles (≤50)
 * @return {Promise<Object>} Map of title → Q ID (titles without an item are omitted)
 */
async function fetchWikibaseItemsChunk( titles ) {
	const params = {
		action: 'query',
		prop: 'pageprops',
		ppprop: 'wikibase_item',
		titles: titles.join( '|' )
	};
	const pages = await queryPages( params );
	const map = {};
	Object.keys( pages ).forEach( ( pageId ) => {
		const page = pages[ pageId ];
		const pageProps = page.pageprops;
		if ( page.title !== undefined && pageProps && pageProps.wikibase_item ) {
			map[ page.title ] = pageProps.wikibase_item;
		}
	} );
	return map;
}

/**
 * Resolve article titles to their Wikidata item Q IDs.
 *
 * @param {string[]} titles Article titles
 * @return {Promise<Object>} Map of title → Q ID
 */
async function fetchWikibaseItems( titles ) {
	if ( titles.length === 0 ) {
		return {};
	}
	const chunks = [];
	for ( let i = 0; i < titles.length; i += MAX_TITLES_PER_REQUEST ) {
		chunks.push( titles.slice( i, i + MAX_TITLES_PER_REQUEST ) );
	}
	const maps = await Promise.all(
		chunks.map( ( chunk ) => fetchWikibaseItemsChunk( chunk ) )
	);
	const merged = {};
	maps.forEach( ( map ) => {
		Object.keys( map ).forEach( ( title ) => {
			merged[ title ] = map[ title ];
		} );
	} );
	return merged;
}

module.exports = {
	countReferences,
	fetchPageDetails,
	fetchWikitext,
	searchArticles,
	searchCategories,
	articleUrl,
	fetchCategoryInfo,
	fetchSubcategories,
	searchInCategory,
	searchByTemplate,
	fetchArticleTemplates,
	fetchWikibaseItems,
	getCategoryNames,
	getSiteId
};
