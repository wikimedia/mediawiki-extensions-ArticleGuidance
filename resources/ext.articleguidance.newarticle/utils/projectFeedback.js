'use strict';

const PROJECT_TALKPAGE_URL = 'https://www.mediawiki.org/wiki/Talk:Article_guidance';
const wikiId = mw.config.get( 'wgWikiID' );
/**
 * Build a URL that opens a new talk-page section on the project feedback page,
 * pre-filled with the given section title.
 *
 * @param {string} sectionTitle Preloaded section heading
 * @return {string} URL
 */
function getProjectFeedbackUrl( sectionTitle ) {
	const params = {
		action: 'edit',
		section: 'new',
		dtpreload: 1,
		preloadtitle: sectionTitle
	};
	const url = new URL( PROJECT_TALKPAGE_URL );
	url.search = new URLSearchParams( params ).toString();

	return url.toString();
}

/**
 * Build the feedback URL for users who cannot find a matching article type.
 *
 * @param {string} title
 * @return {string}
 */
function getMissingTypeFeedbackUrl( title ) {
	return getProjectFeedbackUrl(
		`Couldn't find a matching article type when creating article "${ title }" on ${ wikiId }`
	);
}

/**
 * Build the feedback URL for users requesting support for an unsupported subject.
 *
 * @param {Object|null} result Selected result, when available
 * @return {string}
 */
function getRequestSupportUrl( result ) {
	const sectionTitle = result ?
		'Request for support: ' + result.label + ' (' + result.id + ') on ' + wikiId :
		'Request for support';

	return getProjectFeedbackUrl( sectionTitle );
}

module.exports = {
	getMissingTypeFeedbackUrl,
	getRequestSupportUrl
};
