/**
 * SPARQL query utilities for Wikidata
 */

/**
 * Find matches between specific items and supported types using SPARQL
 *
 * Uses SPARQL property paths to find matches via two different hierarchies:
 * 1. Regular items: Uses P31 (instance of) and P279* (subclass of) for standard items
 * 2. Taxons: Uses P171* (parent taxon) for biological taxons
 *
 * The UNION operator allows both property paths to be checked in a single query.
 * This enables the Animal outline (Q729) to match both regular items and taxon items
 * like "Canis lupus" or "Felis catus" which use P171 instead of P31/P279.
 *
 * Property path operators (* = zero or more) traverse hierarchies without a fixed depth limit.
 *
 * Returns all matching outline types for each search result, allowing a single
 * item to match multiple outlines.
 *
 * @param {Array<string>} specificQIds Q IDs from search results (e.g., ['Q937', 'Q243'])
 * @param {Array<string>} supportedQIds Q IDs from outlines (e.g., ['Q5', 'Q33506'])
 * @return {Promise<Object>} Map of { specificQId: [matchedQId1, matchedQId2, ...] }
 */
async function findTypeMatches( specificQIds, supportedQIds ) {
	// Return empty if either array is empty
	if ( !specificQIds || specificQIds.length === 0 ||
		!supportedQIds || supportedQIds.length === 0 ) {
		return {};
	}

	// Build VALUES clause for specific items
	const specificValues = specificQIds.map( ( qid ) => `wd:${ qid }` ).join( ' ' );

	// Build VALUES clause for supported types
	const supportedValues = supportedQIds.map( ( qid ) => `wd:${ qid }` ).join( ' ' );

	// Build SPARQL query using UNION to support both regular items and taxons
	// Regular items use P31 (instance of) and P279* (subclass of)
	// Taxons use P171* (parent taxon) for their hierarchical relationships
	// The * operator means zero or more steps up the hierarchy
	const query = `SELECT ?specificItem ?supportedType WHERE {
  VALUES ?specificItem { ${ specificValues } }
  VALUES ?supportedType { ${ supportedValues } }
  {
    # Regular items: instance of something that is a subclass of supported types
    ?specificItem wdt:P31/wdt:P279* ?supportedType .
  } UNION {
    # Taxons: parent taxon chain to supported types
    ?specificItem wdt:P171* ?supportedType .
  }
}`;

	try {
		// Execute SPARQL query against Wikidata Query Service
		const url = 'https://query.wikidata.org/sparql?' + new URLSearchParams( {
			query: query,
			format: 'json'
		} );

		const response = await fetch( url, {
			headers: {
				Accept: 'application/sparql-results+json',
				'User-Agent': 'MediaWiki ArticleGuidance Extension'
			}
		} );

		if ( !response.ok ) {
			throw new Error( `SPARQL query failed: ${ response.status }` );
		}

		const data = await response.json();

		// Parse results into a map with arrays of all matching types
		const matches = {};

		if ( data.results && data.results.bindings ) {
			data.results.bindings.forEach( ( binding ) => {
				// Extract Q IDs from URIs
				const specific = binding.specificItem.value.replace( 'http://www.wikidata.org/entity/', '' );
				const supported = binding.supportedType.value.replace( 'http://www.wikidata.org/entity/', '' );

				// Store all matching types for each specific item
				if ( !matches[ specific ] ) {
					matches[ specific ] = [];
				}
				// Avoid duplicates
				if ( !matches[ specific ].includes( supported ) ) {
					matches[ specific ].push( supported );
				}
			} );
		}

		return matches;
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'SPARQL query error:', error );
		// Return empty matches on error - graceful degradation
		return {};
	}
}

module.exports = {
	findTypeMatches
};
