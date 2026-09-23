/**
 * Picks the outline that the workflow uses, and names it for instrumentation.
 *
 * A wiki can have one generic guidance outline (T435605). It is not linked to a
 * Wikidata item, so it never matches a search result. The workflow falls back to
 * it when no other outline matches the selected topic.
 */

/**
 * Identifies the generic outline wherever a Q ID identifies a regular one:
 * instrumentation events, and the outlineQId parameter of the source
 * validation endpoint. Mirrors the article-type="*" attribute that marks the
 * outline on-wiki, and OutlineService::GENERIC_ARTICLE_TYPE on the server.
 */
const GENERIC_ARTICLE_TYPE = '*';

/**
 * Find the generic guidance outline.
 *
 * @param {Array|null} outlines Loaded outlines
 * @return {Object|null} The generic outline, or null if the wiki has none
 */
function findGenericOutline( outlines ) {
	return ( outlines || [] ).find( ( outline ) => !!outline.generic ) || null;
}

/**
 * Find the outline to use for a search result.
 *
 * @param {Array|null} outlines Loaded outlines
 * @param {string|null} matchedQId Q ID that the search result matched, if any
 * @return {Object|null} The matching outline, else the generic outline, else null
 */
function selectOutlineForResult( outlines, matchedQId ) {
	if ( matchedQId ) {
		const matched = ( outlines || [] ).find(
			( outline ) => outline.articleTypes.some( ( type ) => type.id === matchedQId )
		);
		if ( matched ) {
			return matched;
		}
	}
	return findGenericOutline( outlines );
}

/**
 * Get a Q ID that the server can resolve this outline from.
 *
 * An outline has no single identifying Q ID: it is linked to a set of them,
 * and getOutlineByQId() resolves the outline from any one. This returns the
 * first, chosen arbitrarily. Use it only to name the outline to the server,
 * never to describe which type a subject matched.
 *
 * @param {Object|null} outline Outline in use, if any
 * @return {string|null} '*' for the generic outline, one of its Q IDs for any
 *   other, or null when there is no outline
 */
function getOutlineLookupQId( outline ) {
	if ( !outline ) {
		return null;
	}
	if ( outline.generic ) {
		return GENERIC_ARTICLE_TYPE;
	}
	const anyType = outline.articleTypes && outline.articleTypes[ 0 ];
	return anyType ? anyType.id : null;
}

/**
 * Describe an outline for an instrumentation event.
 *
 * The Q IDs are the analytic value. An outline is linked to a set of them and
 * none is privileged, so the set is reported whole; matched_qid says which one
 * the subject matched, and is null when no match chose the outline. The page
 * title identifies the outline for troubleshooting, and joins the events of
 * one session.
 *
 * @param {Object|null} outline Outline the workflow uses, if any
 * @param {string|null} matchedQId Q ID the subject matched, if a match chose
 *   the outline
 * @return {{qids: string[], matched_qid: string|null, title: string|null}}
 */
/* eslint-disable camelcase -- matched_qid matches the other event fields */
function outlineEventContext( outline, matchedQId ) {
	if ( !outline ) {
		return { qids: [], matched_qid: null, title: null };
	}
	return {
		qids: outline.generic ? [ GENERIC_ARTICLE_TYPE ] :
			( outline.articleTypes || [] ).map( ( type ) => type.id ),
		matched_qid: matchedQId || null,
		title: outline.title
	};
}
/* eslint-enable camelcase */

module.exports = {
	GENERIC_ARTICLE_TYPE,
	findGenericOutline,
	selectOutlineForResult,
	getOutlineLookupQId,
	outlineEventContext
};
