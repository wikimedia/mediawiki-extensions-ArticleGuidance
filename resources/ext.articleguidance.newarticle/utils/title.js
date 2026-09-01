'use strict';

const NS_MAIN = 0;

/**
 * Validate whether a string is a legal MediaWiki article title
 * in the Main namespace (NS_MAIN).
 *
 * @param {string} text
 * @return {boolean}
 */
function isValidTitle( text ) {
	if ( !text || typeof text !== 'string' ) {
		return false;
	}
	const trimmed = text.trim();
	if ( !trimmed ) {
		return false;
	}
	const title = mw.Title.newFromText( trimmed );
	return title !== null && title.getNamespaceId() === NS_MAIN && !title.getFragment();
}

/**
 * Extract unique invalid characters or disallowed namespace prefixes
 * from a title string.
 *
 * @param {string} text
 * @return {string[]} Array of unique invalid characters or namespace prefixes
 *   (e.g. ['[', ']'] or ['User:'])
 */
function getInvalidTitleCharacters( text ) {
	if ( !text || typeof text !== 'string' ) {
		return [];
	}

	const invalidItems = [];

	// 1. Illegal characters not in wgLegalTitleChars (e.g. [ ] { } < > | #)
	const legalChars = mw.config.get( 'wgLegalTitleChars' );
	const rInvalid = new RegExp( '[^' + legalChars + ']', 'g' );
	const charMatches = text.match( rInvalid ) || [];
	invalidItems.push( ...charMatches );

	// 2. Disallowed namespace prefixes (e.g. "User:", "Special:", "Talk:")
	const colonMatch = text.match( /^([^:]+:)/ );
	if ( colonMatch ) {
		const prefix = colonMatch[ 1 ].slice( 0, -1 ).trim().toLowerCase().replace( / /g, '_' );
		const nsIds = mw.config.get( 'wgNamespaceIds' );
		if ( prefix in nsIds && nsIds[ prefix ] !== NS_MAIN ) {
			invalidItems.push( colonMatch[ 1 ] );
		}
	}

	return Array.from( new Set( invalidItems ) );
}

module.exports = {
	isValidTitle,
	getInvalidTitleCharacters
};
