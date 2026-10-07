/* eslint-disable no-console */
/**
 * Console reporter for outline-matching evaluation.
 */

/**
 * Log the outline match of the selected search result to the browser console.
 *
 * Multiple matches are flagged with ⚠.
 *
 * @param {string} itemQId Q ID of the selected item
 * @param {string[]} matchedQIds Post-selectBestMatches article-type Q IDs
 * @param {Array} outlines Outlines that declare article types
 */
function reportOutlineMatch( itemQId, matchedQIds, outlines ) {
	const debugParam = mw.util.getParamValue( 'debug' );
	if ( debugParam !== '1' && debugParam !== 'true' ) {
		return;
	}

	const formatOutline = ( qid ) => {
		const outline = outlines.find(
			( o ) => o.articleTypes.some( ( t ) => t.id === qid )
		);
		if ( !outline ) {
			return qid + ' (depth ?)';
		}
		// Depth is per matched Q ID, not per outline (T421260)
		const typeEntry = outline.articleTypes.find( ( t ) => t.id === qid );
		const depth = ( typeEntry.hierarchyDepth !== null &&
			typeEntry.hierarchyDepth !== undefined ) ? typeEntry.hierarchyDepth : '?';
		return ( outline.label || qid ) + ' (depth ' + depth + ')';
	};

	let matchCol;
	if ( matchedQIds.length === 0 ) {
		matchCol = '—';
	} else if ( matchedQIds.length === 1 ) {
		matchCol = formatOutline( matchedQIds[ 0 ] );
	} else {
		matchCol = '⚠ ' + matchedQIds.map( formatOutline ).join( ', ' );
	}
	console.log( '[ArticleGuidance] Outline match for ' + itemQId + ': ' + matchCol );
}

module.exports = { reportOutlineMatch };
