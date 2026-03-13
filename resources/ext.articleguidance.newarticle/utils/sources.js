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
		// Hostname must contain a dot (top level domain)
		return urlObj.hostname.includes( '.' );
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

module.exports = {
	isValidUrl,
	isDuplicate
};
