#!/usr/bin/env node
// validate-citoid.js — Pre-deployment check that ArticleGuidance's Citoid
// citation formatting produces valid, localised wikitext on a *real* wiki.
//
// Unit tests only exercise the conversion logic with mocked inputs. This script
// validates the assumptions that can only be confirmed against the live
// services, per target wiki, without deploying anything:
//   1. MediaWiki:Citoid-template-type-map.json  (itemType → template name)
//   2. the Citoid service 'mediawiki' citation  (real field/author shapes)
//   3. each template's TemplateData maps.citoid  (Citoid field → parameter name)
// It then runs the real citationToWikitext() from the extension over that data
// and prints the wikitext it would insert, flagging anything suspicious
// (missing type map, no maps.citoid → English fallback, duplicate parameters).
//
// All requests are read-only.
//
// Usage:
//   node scripts/validate-citoid.js --url https://fr.wikipedia.org
//   node scripts/validate-citoid.js --url https://pt.wikipedia.org \
//     --cite https://doi.org/10.1371/journal.pone.0000308 \
//     --cite https://www.mediawiki.org/wiki/MediaWiki
//   [--lang <content-language-override>]

'use strict';

// Reuse the extension's real conversion logic. It only touches mw in its
// English-fallback path, so a minimal stub is enough.
global.mw = { log: { warn: ( ...a ) => console.warn( '  [mw.log.warn]', ...a ) } };
const { citationToWikitext } = require(
	'../resources/ext.articleguidance.newarticle/utils/citation.js'
);

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const DEFAULT_CITES = [ 'https://doi.org/10.1371/journal.pone.0000308' ];

const opts = { url: '', lang: '', cites: [] };
const args = process.argv.slice( 2 );
for ( let i = 0; i < args.length; i++ ) {
	switch ( args[ i ] ) {
		case '--url':
			opts.url = args[ ++i ];
			break;
		case '--lang':
			opts.lang = args[ ++i ];
			break;
		case '--cite':
			opts.cites.push( args[ ++i ] );
			break;
		default:
			console.error( `Unknown argument: ${ args[ i ] }` );
			console.error( 'Usage: node scripts/validate-citoid.js --url <wiki> [--cite <url>]… [--lang <code>]' );
			throw new Error( 'Invalid arguments' );
	}
}

if ( !opts.url ) {
	throw new Error( '--url is required, e.g. --url https://fr.wikipedia.org' );
}
if ( opts.cites.length === 0 ) {
	opts.cites = DEFAULT_CITES;
}

const baseUrl = opts.url.replace( /\/$/, '' );
const apiUrl = baseUrl + '/w/api.php';
const USER_AGENT = 'MediaWiki/ArticleGuidance language-product-localization@wikimedia.org';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function httpJson( url, accept ) {
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	const response = await fetch( url, {
		headers: { 'User-Agent': USER_AGENT, Accept: accept || 'application/json' }
	} );
	if ( !response.ok ) {
		throw new Error( `HTTP ${ response.status } ${ response.statusText } for ${ url }` );
	}
	return response.json();
}

function apiGet( params ) {
	const url = new URL( apiUrl );
	for ( const [ k, v ] of Object.entries( params ) ) {
		url.searchParams.set( k, v );
	}
	return httpJson( url.toString() );
}

// ---------------------------------------------------------------------------
// Steps mirroring resources/.../api/Citoid.js orchestration
// ---------------------------------------------------------------------------

/** @return {Promise<string>} The wiki's content language code. */
async function fetchContentLanguage() {
	if ( opts.lang ) {
		return opts.lang;
	}
	const data = await apiGet( {
		action: 'query', meta: 'siteinfo', siprop: 'general', format: 'json', formatversion: '2'
	} );
	return ( data.query && data.query.general && data.query.general.lang ) || 'en';
}

/**
 * Read the per-wiki, content-language type map exactly as the Citoid data
 * module exposes it (allmessages → inContentLanguage). Returns null when the
 * message is unset/unparseable (mirrors getCitoidTypeMap's guard).
 *
 * @param {string} lang
 * @return {Promise<Object|null>}
 */
async function fetchTypeMap( lang ) {
	const data = await apiGet( {
		action: 'query',
		meta: 'allmessages',
		ammessages: 'citoid-template-type-map.json',
		amlang: lang,
		format: 'json',
		formatversion: '2'
	} );
	const raw = data.query && data.query.allmessages && data.query.allmessages[ 0 ] &&
		data.query.allmessages[ 0 ].content;
	if ( typeof raw === 'string' && raw.charAt( 0 ) === '{' ) {
		try {
			return JSON.parse( raw );
		} catch ( e ) {
			return null;
		}
	}
	return null;
}

/**
 * Resolve a citation's template name from the type map (mirrors Citoid.js).
 *
 * @param {Object|undefined} citation
 * @param {Object|null} typeMap
 * @return {string|null}
 */
function resolveTemplateName( citation, typeMap ) {
	if ( !citation || !citation.itemType || !typeMap ) {
		return null;
	}
	// eslint-disable-next-line no-underscore-dangle
	return typeMap[ citation.itemType ] || typeMap._default || null;
}

/**
 * Fetch a single citation in the 'mediawiki' format from the Citoid service.
 *
 * @param {string} url
 * @return {Promise<Object|undefined>}
 */
async function fetchCitation( url ) {
	const endpoint = baseUrl + '/api/rest_v1/data/citation/mediawiki/' + encodeURIComponent( url );
	const data = await httpJson( endpoint, 'application/json' );
	if ( !Array.isArray( data ) ) {
		throw new Error( ( data && data.error ) || 'Citoid returned no citation' );
	}
	return data[ 0 ];
}

/**
 * Fetch a template's TemplateData maps.citoid. Uses the canonical 'Template:'
 * prefix, which the API accepts on every wiki regardless of content language.
 *
 * @param {string} name
 * @param {string} lang
 * @return {Promise<Object|null>}
 */
async function fetchCitoidMap( name, lang ) {
	const data = await apiGet( {
		action: 'templatedata',
		titles: 'Template:' + name,
		redirects: '1',
		includeMissingTitles: '1',
		lang: lang,
		format: 'json',
		formatversion: '2'
	} );
	const page = data.pages && Object.values( data.pages )[ 0 ];
	return ( page && page.maps && page.maps.citoid ) || null;
}

/**
 * Detect duplicate parameter names in produced wikitext.
 *
 * @param {string} wikitext
 * @return {string[]} Duplicated parameter names
 */
function duplicateParams( wikitext ) {
	const inner = wikitext.replace( /^\{\{[^|]*\|/, '' ).replace( /\}\}$/, '' );
	const seen = new Set();
	const dups = new Set();
	inner.split( '|' ).forEach( ( part ) => {
		const name = part.slice( 0, part.indexOf( '=' ) ).trim();
		if ( name && seen.has( name ) ) {
			dups.add( name );
		}
		seen.add( name );
	} );
	return [ ...dups ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	console.log( `Validating Citoid citation formatting against ${ baseUrl }\n` );

	const lang = await fetchContentLanguage();
	console.log( `Content language: ${ lang }` );

	const typeMap = await fetchTypeMap( lang );
	if ( !typeMap ) {
		console.warn(
			'  ! No usable MediaWiki:Citoid-template-type-map.json on this wiki.\n' +
			'    The extension would fall back to English template names — Citoid\n' +
			'    citations are NOT localised here.'
		);
	} else {
		// eslint-disable-next-line no-underscore-dangle
		console.log( `Type map: ${ Object.keys( typeMap ).length } entries (default: ${ typeMap._default || 'none' })` );
	}
	console.log( '' );

	const mapCache = new Map();
	let issues = 0;

	for ( const citeUrl of opts.cites ) {
		console.log( `▶ ${ citeUrl }` );
		let citation;
		try {
			citation = await fetchCitation( citeUrl );
		} catch ( e ) {
			console.warn( `  ! Citoid lookup failed: ${ e.message } (extension falls back to raw URL)\n` );
			continue;
		}
		if ( !citation || !citation.itemType ) {
			console.warn( '  ! Citoid returned no usable citation (falls back to raw URL)\n' );
			continue;
		}

		const templateName = resolveTemplateName( citation, typeMap );
		if ( !templateName ) {
			console.warn( `  ! itemType "${ citation.itemType }" maps to no template (falls back to raw URL)\n` );
			continue;
		}

		if ( !mapCache.has( templateName ) ) {
			mapCache.set( templateName, await fetchCitoidMap( templateName, lang ) );
		}
		const citoidMap = mapCache.get( templateName );

		console.log( `  itemType: ${ citation.itemType }  →  template: ${ templateName }` );
		if ( !citoidMap ) {
			console.warn( `  ! Template:${ templateName } has no TemplateData maps.citoid — using English parameter fallback (likely wrong here)` );
			issues++;
		}

		const wikitext = citationToWikitext( citation, templateName, citoidMap );
		if ( !wikitext ) {
			console.warn( '  ! Produced no wikitext (falls back to raw URL)\n' );
			continue;
		}

		const dups = duplicateParams( wikitext );
		if ( dups.length ) {
			console.error( `  ✗ Duplicate parameter(s): ${ dups.join( ', ' ) }` );
			issues++;
		}

		console.log( `  ${ wikitext }\n` );
	}

	console.log( issues > 0 ?
		`Done with ${ issues } issue(s) — review the warnings above.` :
		'Done. No issues detected.' );
	if ( issues > 0 ) {
		process.exitCode = 1;
	}
}

main().catch( ( err ) => {
	console.error( `Fatal: ${ err.message }` );
	process.exitCode = 1;
} );
