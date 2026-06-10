const { isMobile } = require( './mobile.js' );

/**
 * Build the VisualEditor URL for creating or editing an article.
 *
 * @param {string} title         Target article title (may include namespace prefix)
 * @param {string} outlineTitle  MW page title of the preload template (outline)
 * @param {Array}  references    Per-reference content strings — Citoid-formatted
 *                               citation wikitext (e.g. {{Cite web|…}}) when
 *                               available, otherwise the raw URL. Each is
 *                               wrapped in a numbered <ref> tag.
 * @param {string} [itemId]      Wikidata item Q-id the article is about, when the user
 *                               selected a specific item (used to connect the published
 *                               article to Wikidata)
 * @return {string}
 */
function getCreateArticleUrl( title, outlineTitle, references, itemId ) {
	const preloadParams = references.map( ( r, index ) => `<ref name="ref${ index + 1 }">${ r }</ref>` );

	const params = {
		veaction: 'edit',
		preload: outlineTitle,
		preloadparams: [ preloadParams.join( '\n' ) ],
		articleguidance: 1,
		cxhidebetapopup: 1
	};

	if ( itemId && /^Q\d+$/.test( itemId ) ) {
		params.articleguidanceitem = itemId;
	}

	if ( isMobile() ) {
		params.action = 'edit';
	}

	return mw.util.getUrl( title, params );
}

/**
 * Build the URL for editing an existing article.
 *
 * @param {string} title Article title
 * @return {string}
 */
function getEditArticleUrl( title ) {
	const params = { veaction: 'edit' };

	if ( isMobile() ) {
		params.action = 'edit';
	}

	return mw.util.getUrl( title, params );
}

module.exports = {
	getCreateArticleUrl,
	getEditArticleUrl
};
