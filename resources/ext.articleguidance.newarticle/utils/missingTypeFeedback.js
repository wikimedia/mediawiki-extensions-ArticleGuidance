'use strict';

const FEEDBACK_PAGE_URL = 'https://www.mediawiki.org/wiki/Talk:Article_guidance';
const FEEDBACK_TOPIC_TITLE = 'Couldn\'t find a matching article type';

/**
 * Build the external feedback URL for users who cannot find a matching type.
 *
 * @return {string}
 */
function getMissingTypeFeedbackUrl() {
	const url = new URL( FEEDBACK_PAGE_URL );
	url.search = new URLSearchParams( {
		action: 'edit',
		section: 'new',
		preloadtitle: FEEDBACK_TOPIC_TITLE
	} ).toString();

	return url.toString();
}

module.exports = { getMissingTypeFeedbackUrl };
