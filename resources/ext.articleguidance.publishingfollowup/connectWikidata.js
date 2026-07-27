/**
 * Connect the just-published article to its Wikidata item by adding a sitelink.
 *
 * Runs silently after an Article Guidance publish, but only when the server exposed a
 * selected Wikidata item (which it does only when the feature is enabled for the
 * environment). The item's existing sitelinks are read first and the write is skipped
 * when the item already links to this wiki, so an existing connection is never
 * overwritten. All failures are non-fatal and produce no UI; each outcome (connected,
 * already-linked, missing item, or error with its API code) is reported to the
 * instrument so the connect rate is measurable in production.
 */
const { logConnectResult } = require( './instrument.js' );

// Action API endpoint from the single ArticleGuidanceWikidataUrls config.
const apiEndpoint = require( './config.json' ).ArticleGuidanceWikidataUrls.api;

// Stable English marker on the Wikidata edit so patrollers can identify (and search
// for) sitelinks added automatically by Article Guidance, rather than by a human.
const CONNECT_SUMMARY = 'Connected to a new article created with Article guidance';

function connectWikidata() {
	const itemId = mw.config.get( 'wgArticleGuidanceConnectItemId' );
	if ( !itemId || !/^Q\d+$/.test( itemId ) ) {
		return;
	}

	// Wikibase site global id; equals the database name for Wikipedias (e.g. "enwiki").
	const linksite = mw.config.get( 'wgDBname' );
	const linktitle = mw.config.get( 'wgPageName' );
	if ( !apiEndpoint || !linksite || !linktitle ) {
		return;
	}

	const api = new mw.ForeignApi( apiEndpoint );

	api.get( {
		action: 'wbgetentities',
		ids: itemId,
		props: 'sitelinks',
		sitefilter: linksite,
		formatversion: 2
	} ).then( ( data ) => {
		const entity = data && data.entities && data.entities[ itemId ];
		if ( !entity || entity.missing !== undefined ) {
			// The item no longer exists (deleted or bad id); nothing to connect to.
			mw.log.warn( '[ArticleGuidance] Wikidata connect missing item' );
			logConnectResult( 'missing_item', itemId );
			return null;
		}
		const sitelinks = entity.sitelinks;
		if ( sitelinks && sitelinks[ linksite ] ) {
			// The item already links to this wiki; never overwrite it.
			mw.log.warn( '[ArticleGuidance] Wikidata connect already-linked' );
			logConnectResult( 'already_linked', itemId );
			return null;
		}
		return api.postWithToken( 'csrf', {
			action: 'wbsetsitelink',
			id: itemId,
			linksite: linksite,
			linktitle: linktitle,
			summary: CONNECT_SUMMARY,
			formatversion: 2
		} ).then( () => {
			logConnectResult( 'connected', itemId );
		} );
	} ).catch( ( code ) => {
		mw.log.error( '[ArticleGuidance] Wikidata connect error: ' + code );
		logConnectResult( 'error', itemId, code );
	} );
}

module.exports = connectWikidata;
