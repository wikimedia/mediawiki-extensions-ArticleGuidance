const { isMobile } = require( './mobile.js' );

/**
 * Build the VisualEditor URL for creating or editing an article.
 *
 * @param {string} title         Target article title (may include namespace prefix)
 * @param {string} outlineTitle  MW page title of the preload template (outline)
 * @param {Array}  references    User-supplied reference strings
 * @return {string}
 */
function getCreateArticleUrl( title, outlineTitle, references ) {
	const preloadParams = references.map( ( r, index ) => `<ref name="ref${ index + 1 }">${ r }</ref>` );

	const params = {
		veaction: 'edit',
		preload: outlineTitle,
		preloadparams: [ preloadParams.join( '\n' ) ],
		articleguidance: 1,
		cxhidebetapopup: 1
	};

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
