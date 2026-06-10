/**
 * Connect the just-published article to its Wikidata item by adding a sitelink.
 *
 * Runs silently after an Article Guidance publish, but only when the server exposed a
 * selected Wikidata item (which it does only when the feature is enabled for the
 * environment). The item's existing sitelinks are read first and the write is skipped
 * when the item already links to this wiki, so an existing connection is never
 * overwritten. All failures are non-fatal and produce no UI.
 */
function connectWikidata() {
	const itemId = mw.config.get( 'wgArticleGuidanceConnectItemId' );
	if ( !itemId || !/^Q\d+$/.test( itemId ) ) {
		return;
	}

	const apiUrl = mw.config.get( 'wgArticleGuidanceWikidataApiUrl' );
	// Wikibase site global id; equals the database name for Wikipedias (e.g. "enwiki").
	const linksite = mw.config.get( 'wgDBname' );
	const linktitle = mw.config.get( 'wgPageName' );
	if ( !apiUrl || !linksite || !linktitle ) {
		return;
	}

	const api = new mw.ForeignApi( apiUrl );

	api.get( {
		action: 'wbgetentities',
		ids: itemId,
		props: 'sitelinks',
		sitefilter: linksite,
		formatversion: 2
	} ).then( ( data ) => {
		const entity = data && data.entities && data.entities[ itemId ];
		const sitelinks = entity && entity.sitelinks;
		if ( sitelinks && sitelinks[ linksite ] ) {
			// The item already links to this wiki; never overwrite it.
			mw.log.warn( '[ArticleGuidance] Wikidata connect already-linked' );
			return null;
		}
		return api.postWithToken( 'csrf', {
			action: 'wbsetsitelink',
			id: itemId,
			linksite: linksite,
			linktitle: linktitle,
			formatversion: 2
		} );
	} ).catch( ( code ) => {
		mw.log.error( '[ArticleGuidance] Wikidata connect error: ' + code );
	} );
}

module.exports = connectWikidata;
