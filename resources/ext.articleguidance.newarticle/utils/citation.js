/**
 * Utility for converting Citoid citation data to wikitext template strings
 */

/**
 * Fallback map from Citoid field names to standard *English* MediaWiki citation
 * template parameter names. Used only when a template exposes no TemplateData
 * 'maps.citoid' block (so per-wiki parameter names are unavailable). On a
 * properly Citoid-configured wiki the maps.citoid path is used instead.
 */
const CITOID_TO_PARAM = {
	url: 'url',
	title: 'title',
	date: 'date',
	accessDate: 'access-date',
	publisher: 'publisher',
	website: 'website',
	language: 'language',
	publicationTitle: 'journal',
	encyclopediaTitle: 'encyclopedia',
	volume: 'volume',
	issue: 'issue',
	pages: 'pages',
	place: 'location',
	edition: 'edition',
	DOI: 'doi',
	ISBN: 'isbn',
	ISSN: 'issn'
};

/**
 * Append a `param=value` pair to the parts array when both are non-empty
 * strings. Like ve.dm.MWTemplateModel#addParameter, a template parameter is
 * only set once (first value wins) — later duplicates are ignored. This matters
 * because a maps.citoid block can map several Citoid fields to the same
 * template parameter (e.g. fr maps publicationTitle and libraryCatalog both to
 * 'périodique'), which would otherwise emit an invalid duplicate parameter.
 *
 * @param {string[]} parts
 * @param {Set<string>} seen - Parameter names already added
 * @param {*} param
 * @param {*} value
 */
function addParam( parts, seen, param, value ) {
	if ( param && typeof param === 'string' && value && typeof value === 'string' && !seen.has( param ) ) {
		seen.add( param );
		parts.push( param + '=' + value );
	}
}

/**
 * Build wikitext params from a citation using a template's 'maps.citoid' block.
 *
 * Mirrors ve.ui.CitoidInspector.static.populateTemplate: iterates over the map
 * keys (not the citation keys) and handles scalar values, 1-D arrays and 2-D
 * arrays (e.g. author = [ [ first, last ], … ]), including the "unbalanced map"
 * cases where the citation value is deeper than the mapped template field and
 * values are concatenated.
 *
 * @param {Object} citation - A single Citoid citation object (mediawiki format)
 * @param {Object} citoidMap - The template's maps.citoid object
 * @return {string[]} Array of `param=value` strings
 */
function paramsFromCitoidMap( citation, citoidMap ) {
	const parts = [];
	const seen = new Set();

	for ( const citoidField in citoidMap ) {
		const templateField = citoidMap[ citoidField ];
		const value = citation[ citoidField ];

		// Case: Citoid field directly equivalent to a single template parameter.
		if ( typeof templateField === 'string' && typeof value === 'string' ) {
			addParam( parts, seen, templateField, value );
			continue;
		}

		// Case: Citoid field is a 1-D or 2-D array.
		if ( !Array.isArray( value ) ) {
			continue;
		}

		// Accumulates array elements that have no equivalent template field,
		// joined into the single (string) templateField.
		let concatCitoidField = null;

		for ( let i = 0; i < value.length; i++ ) {
			if ( typeof value[ i ] === 'string' && value[ i ] ) {
				// 1-D array of template fields.
				if ( Array.isArray( templateField ) && typeof templateField[ i ] === 'string' ) {
					addParam( parts, seen, templateField[ i ], value[ i ] );
				} else if ( typeof templateField === 'string' ) {
					concatCitoidField = concatCitoidField ?
						concatCitoidField + ', ' + value[ i ] :
						value[ i ];
				}
			} else if ( Array.isArray( value[ i ] ) ) {
				// 2-D array (e.g. author = [ [ first, last ], … ]).
				let concat2dField = null;

				for ( let j = 0; j < value[ i ].length; j++ ) {
					const inner = value[ i ][ j ];
					if ( typeof inner !== 'string' || !inner ) {
						continue;
					}
					if ( Array.isArray( templateField[ i ] ) && typeof templateField[ i ][ j ] === 'string' ) {
						addParam( parts, seen, templateField[ i ][ j ], inner );
					} else {
						concat2dField = concat2dField ? concat2dField + ' ' + inner : inner;
					}
				}

				if ( concat2dField ) {
					if ( Array.isArray( templateField ) && typeof templateField[ i ] === 'string' ) {
						addParam( parts, templateField[ i ], concat2dField );
					} else {
						concatCitoidField = concatCitoidField ?
							concatCitoidField + ', ' + concat2dField :
							concat2dField;
					}
				}
			}
		}

		if ( concatCitoidField && typeof templateField === 'string' ) {
			addParam( parts, seen, templateField, concatCitoidField );
		}
	}

	return parts;
}

/**
 * Build wikitext params from a citation using the static English fallback table.
 *
 * Used only when the template has no maps.citoid. Handles the 2-D author array
 * shape returned by Citoid's 'mediawiki' format (author = [ [ first, last ], … ]).
 *
 * @param {Object} citation - A single Citoid citation object (mediawiki format)
 * @return {string[]} Array of `param=value` strings
 */
function paramsFromDefaults( citation ) {
	const parts = [];
	const seen = new Set();

	Object.keys( CITOID_TO_PARAM ).forEach( ( citoidField ) => {
		addParam( parts, seen, CITOID_TO_PARAM[ citoidField ], citation[ citoidField ] );
	} );

	if ( Array.isArray( citation.author ) ) {
		citation.author.forEach( ( author, i ) => {
			if ( !Array.isArray( author ) ) {
				return;
			}
			const suffix = i === 0 ? '' : String( i + 1 );
			addParam( parts, seen, 'first' + suffix, author[ 0 ] );
			addParam( parts, seen, 'last' + suffix, author[ 1 ] );
		} );
	}

	return parts;
}

/**
 * Convert a flat Citoid citation object to a wikitext template string.
 *
 * Parameter names come from the template's TemplateData 'maps.citoid' block
 * (citoidMap) when available, which is how Citoid/VisualEditor localises
 * citations per-wiki. When citoidMap is missing (template has no maps.citoid),
 * falls back to a static English parameter table so English wikis still work.
 *
 * Returns null when no template name is given or when the citation yields no
 * usable parameters, so callers can fall back to the raw URL.
 *
 * @param {Object} citationData - A single citation object returned by Citoid
 * @param {string} templateName - The resolved (localised) template name
 * @param {Object|null} citoidMap - The template's maps.citoid object, or null
 * @return {string|null} Wikitext string like `{{Cite web|url=…|title=…}}`, or null
 */
function citationToWikitext( citationData, templateName, citoidMap ) {
	if ( !citationData || !citationData.itemType || !templateName ) {
		return null;
	}

	let parts;
	if ( citoidMap && typeof citoidMap === 'object' ) {
		parts = paramsFromCitoidMap( citationData, citoidMap );
	} else {
		mw.log.warn( '[ArticleGuidance] No maps.citoid for "' + templateName + '"; using English parameter fallback' );
		parts = paramsFromDefaults( citationData );
	}

	if ( parts.length === 0 ) {
		return null;
	}

	return '{{' + templateName + '|' + parts.join( '|' ) + '}}';
}

module.exports = {
	citationToWikitext
};
