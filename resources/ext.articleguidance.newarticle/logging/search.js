/* eslint-disable no-console */
/**
 * Console reporter for search outline-matching evaluation.
 */

/**
 * Log the outcome of outline matching for all search results to the browser console.
 *
 * Results are logged in a single collapsed group. Each result is one line.
 * Multiple matches on a single result are flagged with ⚠.
 *
 * @param {string} searchQuery   The search query string
 * @param {Array}  results       Ordered display results (supported first, then unsupported)
 * @param {Object} sparqlMatches Post-selectBestMatches map { itemQId: string[] }
 * @param {Object} outlineByType Map of { articleTypeQId: outline }
 */
// Must stay in sync with MAX_TOTAL / MAX_UNSUPPORTED in SearchStep.vue
const MAX_TOTAL = 8;
const MAX_UNSUPPORTED = 3;

function reportSearchEvaluation( searchQuery, results, sparqlMatches, outlineByType ) {
	const debugParam = mw.util.getParamValue( 'debug' );
	if ( debugParam !== '1' && debugParam !== 'true' ) {
		return;
	}

	const displayed = results
		.filter( ( r ) => r.supported )
		.concat( results.filter( ( r ) => !r.supported ).slice( 0, MAX_UNSUPPORTED ) )
		.slice( 0, MAX_TOTAL );

	const formatOutline = ( qid ) => {
		const outline = outlineByType[ qid ];
		if ( !outline ) {
			return qid + ' (depth ?)';
		}
		// Depth is per matched Q ID, not per outline (T421260)
		const typeEntry = ( outline.articleTypes || [] ).find( ( t ) => t.id === qid );
		const depth = ( typeEntry && typeEntry.hierarchyDepth !== null &&
			typeEntry.hierarchyDepth !== undefined ) ? typeEntry.hierarchyDepth : '?';
		return ( outline.label || qid ) + ' (depth ' + depth + ')';
	};

	const rows = displayed.map( ( result ) => {
		const itemCol = ( result.label || result.id ) + ' (' + result.id + ')';
		const finalQIds = sparqlMatches[ result.id ] || [];
		let matchCol;
		if ( finalQIds.length === 0 ) {
			matchCol = '—';
		} else if ( finalQIds.length === 1 ) {
			matchCol = formatOutline( finalQIds[ 0 ] );
		} else {
			matchCol = '⚠ ' + finalQIds.map( formatOutline ).join( ', ' );
		}
		return { itemCol, matchCol };
	} );

	const colWidth = rows.reduce( ( max, row ) => Math.max( max, row.itemCol.length ), 0 );

	console.groupCollapsed(
		'[ArticleGuidance] Search "' + searchQuery + '" — ' + displayed.length + ' results'
	);
	rows.forEach( ( row ) => {
		console.log( row.itemCol.padEnd( colWidth + 2 ) + row.matchCol );
	} );
	console.groupEnd();
}

module.exports = { reportSearchEvaluation };
