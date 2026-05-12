const { citationToWikitext } = require( '../utils/citation.js' );

// Module that injects the content-language 'citoid-template-type-map.json'
// message into the client (via ve.init.platform.addMessages). Loaded lazily so
// ArticleGuidance keeps working on wikis without Citoid/VisualEditor.
const CITOID_DATA_MODULE = 'ext.citoid.visualEditor.data';

// Memoised promise for loading CITOID_DATA_MODULE once per page load.
let typeMapModulePromise = null;

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
 * configured or the message is absent/unparseable: with no type map no template
 * name resolves, so citationToWikitext returns null and callers fall back to
 * the raw URL. This mirrors VisualEditor's Citoid integration, which disables
 * the feature entirely when the type map is missing rather than guessing
 * English template names that would be wrong on non-English wikis.
 *
 * @return {Promise<Object>}
 */
async function getCitoidTypeMap() {
	try {
		// No point loading the Citoid module on a wiki without Citoid.
		if ( !getCitoidServiceUrl() ) {
			return {};
		}
		if ( !typeMapModulePromise ) {
			typeMapModulePromise = mw.loader.using( CITOID_DATA_MODULE );
		}
		await typeMapModulePromise;

		const raw = mw.message( 'citoid-template-type-map.json' ).plain();
		// When a message key is missing, mw.message returns the key itself, and
		// the Citoid default value is the literal string 'null'. A valid JSON
		// type map always starts with '{'.
		if ( raw.charAt( 0 ) === '{' ) {
			const parsed = JSON.parse( raw );
			if ( parsed && typeof parsed === 'object' ) {
				return parsed;
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
 * Fetch the TemplateData 'maps.citoid' block for a set of template names.
 *
 * This is how Citoid/VisualEditor localises citation *parameter* names per
 * wiki: each template's TemplateData declares a maps.citoid object mapping
 * Citoid field names to that template's parameters. Returns a map from the
 * requested template name to its maps.citoid object (omitting templates with
 * none). Resolves to an empty object on any failure so callers fall back to the
 * static English parameter table.
 *
 * @param {string[]} names - Bare template names (e.g. 'Lien web')
 * @return {Promise<Object>} Map of template name → maps.citoid object
 */
async function fetchTemplateDataMaps( names ) {
	if ( !names.length ) {
		return {};
	}
	try {
		const titleByName = {};
		names.forEach( ( name ) => {
			titleByName[ name ] = new mw.Title( name, 10 ).getPrefixedText();
		} );

		const api = new mw.Api();
		const response = await api.get( {
			action: 'templatedata',
			titles: Object.keys( titleByName ).map( ( n ) => titleByName[ n ] ).join( '|' ),
			redirects: 1,
			includeMissingTitles: 1,
			lang: mw.config.get( 'wgContentLanguage' ),
			formatversion: 2
		} );

		const pages = ( response && response.pages ) || {};
		const mapsByTitle = {};
		Object.keys( pages ).forEach( ( key ) => {
			const page = pages[ key ];
			if ( page && page.title && page.maps && page.maps.citoid ) {
				mapsByTitle[ page.title ] = page.maps.citoid;
			}
		} );

		// Follow redirects from the requested title to the resolved title.
		const redirectTo = {};
		( ( response && response.redirects ) || [] ).forEach( ( r ) => {
			redirectTo[ r.from ] = r.to;
		} );

		const result = {};
		names.forEach( ( name ) => {
			const resolvedTitle = redirectTo[ titleByName[ name ] ] || titleByName[ name ];
			if ( mapsByTitle[ resolvedTitle ] ) {
				result[ name ] = mapsByTitle[ resolvedTitle ];
			}
		} );
		return result;
	} catch ( e ) {
		mw.log.warn( '[ArticleGuidance] templatedata fetch error:', e );
		return {};
	}
}

/**
 * Fetch Citoid wikitext for an array of URLs in parallel.
 *
 * Resolves the per-wiki type map and the per-template parameter maps, then
 * converts each citation. Returns an array of wikitext-or-null values parallel
 * to the input; failures resolve to null so callers can fall back to raw URLs.
 *
 * @param {string[]} urls - The URLs to look up
 * @return {Promise<Array<string|null>>}
 */
async function fetchAllCitationsWikitext( urls ) {
	const typeMap = await getCitoidTypeMap();
	const citations = await Promise.all( urls.map( fetchCitation ) );

	const templateNames = citations.map( ( data ) => resolveTemplateName( data, typeMap ) );
	const distinctNames = Array.from( new Set( templateNames.filter( Boolean ) ) );
	const mapsByTemplate = await fetchTemplateDataMaps( distinctNames );

	return citations.map( ( data, i ) => {
		const name = templateNames[ i ];
		return citationToWikitext( data, name, name ? mapsByTemplate[ name ] || null : null );
	} );
}

module.exports = {
	fetchCitation,
	fetchAllCitationsWikitext,
	getCitoidTypeMap
};
