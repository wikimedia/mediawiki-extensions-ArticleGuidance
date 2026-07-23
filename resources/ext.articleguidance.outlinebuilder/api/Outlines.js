/**
 * API utility for saving outline drafts.
 */

/**
 * Keep an outline draft on the server, so the editor preloads it on a new
 * outline page for the same article types.
 *
 * @param {string[]} qIds Wikidata Q IDs of the article types. The first is the primary type.
 * @param {string} text Outline wikitext
 * @return {Promise} Resolves when the draft is kept
 * @throws {Error} If the API request fails
 */
async function saveDraft( qIds, text ) {
	await new mw.Rest().post(
		'/articleguidance/v1/outline-draft/' + encodeURIComponent( qIds.join( ',' ) ),
		{
			text: text,
			token: mw.user.tokens.get( 'csrfToken' )
		}
	);
}

module.exports = {
	saveDraft
};
