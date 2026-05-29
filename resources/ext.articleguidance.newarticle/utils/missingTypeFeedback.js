'use strict';

const FEEDBACK_PAGE_URL = 'https://www.mediawiki.org/wiki/Talk:Article_guidance';

/**
 * Build the external feedback URL for users who cannot find a matching type.
 *
 * @param {string} title
 * @param {string} wiki
 * @return {string}
 */
function getMissingTypeFeedbackUrl( title, wiki ) {
	const url = new URL( FEEDBACK_PAGE_URL );
	url.search = new URLSearchParams( {
		action: 'edit',
		section: 'new',
		preloadtitle: `Couldn't find a matching article type when creating article "${ title }" on ${ wiki }`
	} ).toString();

	return url.toString();
}

module.exports = { getMissingTypeFeedbackUrl };
