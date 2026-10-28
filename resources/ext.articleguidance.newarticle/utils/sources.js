/**
 * Check whether the string is a syntactically valid URL.
 *
 * @param {string} url - The URL to validate
 * @return {boolean} True if the URL is valid
 */
function isValidUrl( url ) {
	try {
		let urlToParse = url;
		if ( !/^https?:\/\//i.test( url ) ) {
			urlToParse = 'https://' + url;
		}
		const urlObj = new URL( urlToParse );
		// The hostname must end with a top-level domain that has a letter. The
		// URL parser reads a reference code of digits, such as a PMID or the
		// "10.1234" prefix of a DOI, as an IPv4 address.
		const labels = urlObj.hostname.split( '.' ).filter( Boolean );
		return labels.length > 1 && /[a-z]/i.test( labels[ labels.length - 1 ] );
	} catch ( e ) {
		return false;
	}
}

/**
 * Check if a URL has already been added to a sources list.
 *
 * @param {string} url - The URL to check for duplicates
 * @param {Array} sources - Array of source objects with a `url` property
 * @return {boolean} True if the URL is already in the list
 */
function isDuplicate( url, sources ) {
	let normalised = url.trim().toLowerCase();
	if ( !/^https?:\/\//i.test( normalised ) ) {
		normalised = 'https://' + normalised;
	}
	return sources.some( ( source ) => {
		let existing = source.url.trim().toLowerCase();
		if ( !/^https?:\/\//i.test( existing ) ) {
			existing = 'https://' + existing;
		}
		return existing === normalised;
	} );
}

/**
 * Check whether the string is a reference code that Citoid identifies: a DOI,
 * ISBN, PMID, PMCID or Wikidata QID.
 *
 * Citoid searches Crossref with all other text and nearly always finds a work,
 * so other text must not go to Citoid.
 *
 * @param {string} input - The text to check
 * @return {boolean} True if the text is a reference code
 */
function isReferenceCode( input ) {
	const code = input.trim();
	// Same patterns as the identifier detection of Citoid (CitoidService.js)
	return /^(?:doi:\s*)?10\.\d{3,5}(?:\.\d+)*\/\S+$/i.test( code ) ||
		/^Q[1-9]\d*$/i.test( code ) ||
		/^PMC\d{7}$/.test( code ) ||
		/^(?:97[89])?\d{9}[\dX]$/i.test( code.replace( /[\s-]/g, '' ) ) ||
		/^(?:PMID )?[1-9]\d{0,8}$/.test( code );
}

/**
 * Convert an ISBN to ISBN-13 without hyphens, so that the two forms of an ISBN match.
 *
 * @param {string} isbn - ISBN-10 or ISBN-13, with or without hyphens
 * @return {string}
 */
function toIsbn13( isbn ) {
	const digits = isbn.replace( /[^\dX]/gi, '' ).toUpperCase();
	if ( digits.length !== 10 ) {
		return digits;
	}
	const core = '978' + digits.slice( 0, 9 );
	let sum = 0;
	for ( let i = 0; i < core.length; i++ ) {
		sum += Number( core[ i ] ) * ( i % 2 === 0 ? 1 : 3 );
	}
	return core + ( ( 10 - ( sum % 10 ) ) % 10 );
}

/**
 * Get the identifiers of a source from its Citoid data. Different input for the
 * same work, such as an ISBN-10 and an ISBN-13, or a PMID and a DOI, gives a
 * common identifier.
 *
 * @param {Object} citation - Citoid data in the 'mediawiki' format
 * @return {string[]} Identifiers such as 'doi:10.1038/nature14539'
 */
function getCitationIdentifiers( citation ) {
	const identifiers = [];
	if ( citation.DOI ) {
		identifiers.push( 'doi:' + String( citation.DOI ).trim().toLowerCase() );
	}
	// The ISBN of a book section or a journal article identifies the book or
	// the series, which contains other works.
	if ( citation.itemType === 'book' && citation.ISBN ) {
		const isbns = Array.isArray( citation.ISBN ) ?
			citation.ISBN :
			String( citation.ISBN ).split( /\s+/ );
		isbns.filter( Boolean ).forEach( ( isbn ) => {
			identifiers.push( 'isbn:' + toIsbn13( isbn ) );
		} );
	}
	if ( citation.PMID ) {
		identifiers.push( 'pmid:' + String( citation.PMID ).trim() );
	}
	if ( citation.PMCID ) {
		identifiers.push( 'pmcid:' + String( citation.PMCID ).trim().replace( /^PMC/i, '' ) );
	}
	if ( citation.qid ) {
		identifiers.push( 'qid:' + String( citation.qid ).trim().toUpperCase() );
	}
	return identifiers;
}

/**
 * Check if a source with one of the identifiers has already been added.
 *
 * @param {string[]} identifiers - Identifiers of the new source
 * @param {Array} sources - Array of source objects with an `identifiers` property
 * @return {boolean} True if an added source has one of the identifiers
 */
function hasDuplicateIdentifier( identifiers, sources ) {
	return sources.some( ( source ) => source.identifiers.some(
		( identifier ) => identifiers.includes( identifier )
	) );
}

module.exports = {
	isValidUrl,
	isDuplicate,
	isReferenceCode,
	getCitationIdentifiers,
	hasDuplicateIdentifier
};
