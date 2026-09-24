'use strict';

const config = require( '../config.json' );

const CENTRAL_TALKPAGE_URL = 'https://www.mediawiki.org/wiki/Talk:Article_guidance';

/**
 * Build a URL that opens a new talk-page section, pre-filled with the given
 * section title.
 *
 * Reports go to the wiki's own feedback talk page when one is configured, and
 * to the central page on mediawiki.org otherwise. The central page triages
 * reports from every wiki in English, and JS messages only render in the
 * user's interface language, so the fallback heading is a fixed English string.
 *
 * @param {string} localTitle Preloaded heading for the wiki's own talk page
 * @param {string} centralTitle English preloaded heading for the central page
 * @return {string} URL
 */
function getFeedbackUrl( localTitle, centralTitle ) {
	const params = {
		action: 'edit',
		section: 'new',
		dtpreload: 1
	};

	const talkPage = config.ArticleGuidanceFeedbackTalkPage;
	if ( talkPage ) {
		params.preloadtitle = localTitle;

		return mw.util.getUrl( talkPage, params );
	}

	// The central page collects reports from every wiki, so name the source.
	params.preloadtitle = centralTitle + ' (' + mw.config.get( 'wgWikiID' ) + ')';
	const url = new URL( CENTRAL_TALKPAGE_URL );
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
	return getFeedbackUrl(
		mw.message( 'articleguidance-feedback-missing-type-preloadtitle', title ).text(),
		`Couldn't find a matching article type for "${ title }"`
	);
}

module.exports = {
	getMissingTypeFeedbackUrl
};
