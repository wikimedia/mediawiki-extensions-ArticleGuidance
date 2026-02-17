/**
 * API utility for fetching article guidance outlines
 */

/**
 * Fetch outlines from the ArticleGuidance REST API
 *
 * @return {Promise<Array>} Promise resolving to array of outline objects
 * @throws {Error} If the API request fails
 */
async function fetchOutlines() {
	const api = new mw.Rest();
	const response = await api.get( '/articleguidance/v0/outlines' );
	return response.outlines || [];
}

module.exports = {
	fetchOutlines
};
