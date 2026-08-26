/**
 * API utility for creating a redirect from a red-link title to an existing article
 */

/**
 * Create a redirect from one main-namespace title to another.
 *
 * An ordinary edit, with three details worth naming:
 *
 * - `articleguidance` marks where the edit came from, so EditTagHandler tags it.
 * - `createonly` fails the edit if the title was taken in the meantime.
 * - The keyword comes from the server, in the wiki's content language.
 *
 * @param {string} source Title to turn into a redirect, e.g. the red link followed
 * @param {string} target Existing article the redirect points at
 * @return {Promise<Object>} The Action API edit result
 * @throws {string} Action API error code, e.g. 'articleexists' or 'permissiondenied'
 */
function createRedirect( source, target ) {
	const redirectWord = mw.config.get( 'wgArticleGuidanceRedirectWord' );

	return new mw.Api().postWithToken( 'csrf', {
		action: 'edit',
		title: source,
		text: redirectWord + ' [[' + target + ']]',
		createonly: 1,
		articleguidance: 1,
		formatversion: 2,
		errorformat: 'plaintext',
		errorlang: mw.config.get( 'wgUserLanguage' )
	} );
}

module.exports = {
	createRedirect
};
