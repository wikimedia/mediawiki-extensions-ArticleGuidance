const { citationToWikitext } = require( '../utils/citation.js' );
const { openLinksInNewTab } = require( '../utils/links.js' );
const { getCitationIdentifiers } = require( '../utils/sources.js' );

// Module that injects the content-language 'citoid-template-type-map.json'
// message into the client (via ve.init.platform.addMessages). Loaded lazily so
// ArticleGuidance keeps working on wikis without Citoid/VisualEditor.
const CITOID_DATA_MODULE = 'ext.citoid.visualEditor.data';

// Citoid types that a type map without '_default' must map. Same list as
// ve.ui.Citoid.init.js, which rejects a map that does not.
const REQUIRED_TYPE_MAPPINGS = [
	'artwork', 'audioRecording', 'bill', 'blogPost', 'book', 'bookSection', 'case',
	'computerProgram', 'conferencePaper', 'dictionaryEntry', 'document', 'email',
	'encyclopediaArticle', 'film', 'forumPost', 'hearing', 'instantMessage', 'interview',
	'journalArticle', 'letter', 'magazineArticle', 'manuscript', 'map', 'newspaperArticle',
	'patent', 'podcast', 'presentation', 'radioBroadcast', 'report', 'statute', 'thesis',
	'tvBroadcast', 'videoRecording', 'webpage'
];

// The type map does not change during a page load.
let typeMapPromise = null;

// Promises for maps.citoid, by template name. Many sources use the same template.
const templateMapPromises = {};

/**
 * Build the base Citoid service URL for the 'mediawiki' format, following the
 * same logic as ve.ui.CitoidInspector (fullRestbaseUrl takes precedence over
 * citoidServiceUrl, with a legacy /api suffix stripped).
 *
 * Returns null when Citoid is not configured on this wiki.
 *
 * @return {string|null}
 */
function getCitoidServiceUrl() {
	const citoidConfig = mw.config.get( 'wgCitoidConfig' );
	if ( !citoidConfig ) {
		return null;
	}
	if ( citoidConfig.fullRestbaseUrl ) {
		return citoidConfig.fullRestbaseUrl + 'v1/data/citation/mediawiki';
	}
	if ( citoidConfig.citoidServiceUrl ) {
		return citoidConfig.citoidServiceUrl.replace( /\/api$/, '' ) + '/mediawiki';
	}
	return null;
}

/**
 * Fetch structured citation data for a given URL via Citoid.
 *
 * Citoid returns an array; this resolves with the first element. On any error
 * (network failure, Citoid not installed, unrecognised URL, etc.) it resolves
 * with null so callers can fall back gracefully to the raw URL.
 *
 * @param {string} url - The URL to look up
 * @return {Promise<Object|null>} Promise resolving to a citation object or null
 */
async function fetchCitation( url ) {
	try {
		const serviceUrl = getCitoidServiceUrl();
		if ( !serviceUrl ) {
			return null;
		}
		const response = await fetch(
			serviceUrl + '/' + encodeURIComponent( url ),
			{ headers: { Accept: 'application/json' } }
		);
		if ( !response.ok ) {
			return null;
		}
		const data = await response.json();
		if ( !Array.isArray( data ) || data.length === 0 ) {
			return null;
		}
		return data[ 0 ];
	} catch ( e ) {
		mw.log.warn( '[ArticleGuidance] Citoid fetch error:', e );
		return null;
	}
}

/**
 * Get the Citoid itemType→template name map for this wiki.
 *
 * Lazily loads the Citoid data module so 'citoid-template-type-map.json' (the
 * per-wiki, content-language map at MediaWiki:Citoid-template-type-map.json)
 * becomes readable, then parses it. Returns an empty map when Citoid is not
 * configured, the message is absent/unparseable, or the map has no '_default'
 * and misses a required type: with no type map no template
 * name resolves, so citationToWikitext returns null and callers fall back to
 * the raw URL. This mirrors VisualEditor's Citoid integration, which disables
 * the feature entirely when the type map is missing rather than guessing
 * English template names that would be wrong on non-English wikis.
 *
 * @return {Promise<Object>}
 */
function getCitoidTypeMap() {
	if ( !typeMapPromise ) {
		typeMapPromise = loadCitoidTypeMap();
	}
	return typeMapPromise;
}

/**
 * @return {Promise<Object>}
 */
async function loadCitoidTypeMap() {
	try {
		// No point loading the Citoid module on a wiki without Citoid.
		if ( !getCitoidServiceUrl() ) {
			return {};
		}
		await mw.loader.using( CITOID_DATA_MODULE );

		const raw = mw.message( 'citoid-template-type-map.json' ).plain();
		// When a message key is missing, mw.message returns the key itself, and
		// the Citoid default value is the literal string 'null'. A valid JSON
		// type map always starts with '{'.
		if ( raw.charAt( 0 ) === '{' ) {
			const parsed = JSON.parse( raw );
			if ( parsed && typeof parsed === 'object' ) {
				// eslint-disable-next-line no-underscore-dangle
				const missing = parsed._default ? [] :
					REQUIRED_TYPE_MAPPINGS.filter( ( type ) => !parsed[ type ] );
				if ( !missing.length ) {
					return parsed;
				}
				mw.log.warn( '[ArticleGuidance] Required mapping(s) missing from citoid-template-type-map.json: ' + missing.join( ', ' ) );
			}
		}
	} catch ( e ) {
		mw.log.warn( '[ArticleGuidance] getCitoidTypeMap error:', e );
	}
	return {};
}

/**
 * Resolve the (localised) citation template name for a citation.
 *
 * @param {Object|null} citation
 * @param {Object} typeMap
 * @return {string|null}
 */
function resolveTemplateName( citation, typeMap ) {
	if ( !citation || !citation.itemType ) {
		return null;
	}
	// eslint-disable-next-line no-underscore-dangle
	return typeMap[ citation.itemType ] || typeMap._default || null;
}

/**
 * Fetch the TemplateData 'maps.citoid' block for a template.
 *
 * This is how Citoid/VisualEditor localises citation *parameter* names per
 * wiki: the template's TemplateData declares a maps.citoid object mapping
 * Citoid field names to that template's parameters. Resolves to null when the
 * template has none, or on any failure. The citation then has no wikitext.
 *
 * @param {string} name - Bare template name (e.g. 'Lien web')
 * @return {Promise<Object|null>} maps.citoid object, or null
 */
async function fetchTemplateDataMap( name ) {
	if ( !templateMapPromises[ name ] ) {
		templateMapPromises[ name ] = new mw.Api().get( {
			action: 'templatedata',
			titles: new mw.Title( name, 10 ).getPrefixedText(),
			redirects: 1,
			includeMissingTitles: 1,
			lang: mw.config.get( 'wgContentLanguage' ),
			formatversion: 2
		} ).then( ( response ) => {
			// The request has one title, so the response has at most one page.
			const pages = ( response && response.pages ) || {};
			const page = pages[ Object.keys( pages )[ 0 ] ];
			return ( page && page.maps && page.maps.citoid ) || null;
		} );
	}
	const promise = templateMapPromises[ name ];
	try {
		return await promise;
	} catch ( e ) {
		// Remove the failed request so that the next source tries again.
		if ( templateMapPromises[ name ] === promise ) {
			delete templateMapPromises[ name ];
		}
		mw.log.warn( '[ArticleGuidance] templatedata fetch error:', e );
		return null;
	}
}

/**
 * Render citation wikitext to HTML with the wiki parser.
 *
 * Resolves with null on any failure so callers can fall back to a plain
 * display of the source.
 *
 * @param {string} wikitext - Citation wikitext like `{{Cite web|url=…}}`
 * @return {Promise<string|null>} Parsed HTML with links that open in a new tab, or null
 */
async function renderCitation( wikitext ) {
	try {
		const response = await new mw.Api().post( {
			action: 'parse',
			text: wikitext,
			contentmodel: 'wikitext',
			prop: 'text',
			disablelimitreport: 1,
			disableeditsection: 1,
			disabletoc: 1,
			formatversion: 2
		} );
		const html = response && response.parse && response.parse.text;
		return html ? openLinksInNewTab( html ) : null;
	} catch ( e ) {
		mw.log.warn( '[ArticleGuidance] Citation render error:', e );
		return null;
	}
}

/**
 * Look up a source with Citoid and format it with the wiki's citation template.
 *
 * Resolves the per-wiki type map and the template's parameter map, builds the
 * citation wikitext and renders it to HTML. Resolves with null when Citoid
 * gives no wikitext or on any error, so that the citation never blocks the
 * source. html is null when only the render fails.
 *
 * @param {string} input - URL or reference code (ISBN, DOI, …)
 * @return {Promise<Object|null>} { wikitext, html, itemType, identifiers }, or null
 */
async function fetchFormattedCitation( input ) {
	try {
		const [ typeMap, data ] = await Promise.all( [
			getCitoidTypeMap(),
			fetchCitation( input )
		] );
		const name = resolveTemplateName( data, typeMap );
		const paramMap = name ? await fetchTemplateDataMap( name ) : null;
		const wikitext = citationToWikitext( data, name, paramMap );
		if ( !wikitext ) {
			return null;
		}
		return {
			wikitext,
			html: await renderCitation( wikitext ),
			itemType: data.itemType,
			identifiers: getCitationIdentifiers( data )
		};
	} catch ( e ) {
		mw.log.warn( '[ArticleGuidance] Citation format error:', e );
		return null;
	}
}

module.exports = {
	fetchCitation,
	fetchFormattedCitation,
	getCitoidTypeMap
};
