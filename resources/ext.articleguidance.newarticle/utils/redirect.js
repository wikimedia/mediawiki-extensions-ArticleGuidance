'use strict';

/**
 * Normalise a string for a loose comparison: underscores to spaces, trimmed,
 * lowercased.
 *
 * @param {string|null} value
 * @return {string}
 */
function normalise( value ) {
	return String( value || '' ).replace( /_/g, ' ' ).trim().toLowerCase();
}

/**
 * Whether the search box still holds the title the user followed.
 *
 * It only decides whether to offer the action — the redirect that gets written
 * always uses redLinkTitle, never the query.
 *
 * @param {string|null} redLinkTitle Red link the user followed
 * @param {string} searchQuery Title currently in the search box
 * @return {boolean}
 */
function queryUnchanged( redLinkTitle, searchQuery ) {
	const normalised = normalise( redLinkTitle );
	return normalised !== '' && normalised === normalise( searchQuery );
}

/**
 * Whether two titles name the same wiki page.
 *
 * Strict where queryUnchanged() above is loose, because a wrong answer here
 * hides a legitimate redirect or attempts a self-redirect.
 *
 * @param {string|null} a
 * @param {string|null} b
 * @return {boolean} False when either string is not a usable title
 */
function isSamePage( a, b ) {
	const titleA = mw.Title.newFromText( String( a || '' ) );
	const titleB = mw.Title.newFromText( String( b || '' ) );
	return !!titleA && !!titleB && titleA.getPrefixedDb() === titleB.getPrefixedDb();
}

/**
 * Whether the subject-covered step may offer to turn the red link the user
 * followed into a redirect to the existing article (T426844).
 *
 * A null red-link title means the user did not arrive via a red link. Requiring
 * the query to be unchanged stops someone who arrived from "NYC" but then
 * searched for an unrelated topic from creating "NYC" as a redirect to it.
 * The red link must also still be red.
 *
 * @param {string|null} redLinkTitle Red link the user followed, if any
 * @param {string} searchQuery Title currently in the search box
 * @param {string} targetTitle Existing article the redirect would point at
 * @param {boolean|null} redLinkExists Whether the red-link title exists on the
 *   wiki now. Null while unknown, which is not offerable: better to withhold the
 *   option briefly than to offer one that cannot succeed.
 * @return {boolean}
 */
function isRedirectOfferable( redLinkTitle, searchQuery, targetTitle, redLinkExists ) {
	if ( !redLinkTitle || !targetTitle || redLinkExists !== false ) {
		return false;
	}
	if ( !queryUnchanged( redLinkTitle, searchQuery ) ) {
		return false;
	}
	return !isSamePage( redLinkTitle, targetTitle );
}

module.exports = {
	queryUnchanged,
	isSamePage,
	isRedirectOfferable
};
