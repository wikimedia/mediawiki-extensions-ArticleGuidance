/**
 * Read the outlines of the wiki from the ArticleGuidance REST API.
 */

// The outlines do not change while the page is open, so they are fetched once
let outlinesPromise = null;

/**
 * Fetch outlines from the ArticleGuidance REST API.
 *
 * @return {Promise<Array>} Promise resolving to an array of outline objects
 * @throws {Error} If the API request fails
 */
function fetchOutlines() {
	if ( outlinesPromise === null ) {
		outlinesPromise = new mw.Rest().get( '/articleguidance/v1/outlines' )
			.then( ( response ) => response.outlines || [] )
			.catch( ( err ) => {
				// A failure is not kept, so the next call tries again
				outlinesPromise = null;
				throw err;
			} );
	}
	return outlinesPromise;
}

module.exports = {
	fetchOutlines
};
