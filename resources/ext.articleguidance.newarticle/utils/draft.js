/**
 * Compute the target title for an article that must be created as a draft.
 *
 * The prefix (namespace and optional username/subpage path) is computed
 * server-side by SpecialNewArticle and exposed via wgArticleGuidanceDraftTitlePrefix.
 *
 * @param {string} articleTitle Raw article title entered by the user
 * @return {string}
 */
function getDraftTitle( articleTitle ) {
	const prefix = mw.config.get( 'wgArticleGuidanceDraftTitlePrefix' );
	return prefix + articleTitle;
}

module.exports = { getDraftTitle };
