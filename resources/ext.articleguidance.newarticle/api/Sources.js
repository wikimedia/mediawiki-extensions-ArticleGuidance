/**
 * API utility for validating article sources
 */

/**
 * Validate a source URL against the ArticleGuidance REST API
 *
 * @param {string} url - The URL to validate
 * @param {string} [subjectQId] - Wikidata Q-ID of the article subject
 * @param {string} [outlineQId] - Q-ID of the selected outline/article type
 * @return {Promise<Object>} Promise resolving to { domain, classification, title }
 * @throws {Error} If the API request fails
 */
async function validateSource( url, subjectQId, outlineQId ) {
	const api = new mw.Rest();
	const params = { url };
	if ( subjectQId ) {
		params.subjectQId = subjectQId;
	}
	if ( outlineQId ) {
		params.outlineQId = outlineQId;
	}
	return api.get( '/articleguidance/v0/source/validate', params );
}

module.exports = {
	validateSource
};
