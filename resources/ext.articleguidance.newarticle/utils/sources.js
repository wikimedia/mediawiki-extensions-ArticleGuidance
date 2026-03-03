// Unreliable domains to reject
const UNRELIABLE_DOMAINS = [
	// Social media
	'facebook.com',
	'twitter.com',
	'x.com',
	'instagram.com',
	'tiktok.com',
	'linkedin.com',
	'reddit.com',
	'tumblr.com',
	'pinterest.com',
	'snapchat.com',
	// AI/Generated content
	'chatgpt.com',
	'openai.com',
	'claude.ai',
	'google.com',
	'character.ai',
	// User-generated content platforms
	'medium.com',
	'substack.com',
	'wordpress.com',
	'blogger.com',
	'wix.com',
	'youtube.com',
	'youtu.be'
];

/**
 * Extract the domain name from a URL, stripping www. prefix.
 *
 * @param {string} url - The URL to extract the domain from
 * @return {string} The domain name, or the original string if parsing fails
 */
function extractDomain( url ) {
	try {
		let urlToParse = url;
		if ( !/^https?:\/\//i.test( url ) ) {
			urlToParse = 'https://' + url;
		}
		const urlObj = new URL( urlToParse );
		return urlObj.hostname.toLowerCase().replace( /^www\./, '' );
	} catch ( e ) {
		return url;
	}
}

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
 * Check if a URL is from an unreliable domain.
 *
 * @param {string} url - The URL to check
 * @return {boolean} True if the domain is unreliable
 */
function isUnreliable( url ) {
	const domain = extractDomain( url );
	for ( const bad of UNRELIABLE_DOMAINS ) {
		if ( domain === bad || domain.endsWith( '.' + bad ) ) {
			return true;
		}
	}
	return false;
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
	UNRELIABLE_DOMAINS,
	extractDomain,
	isValidUrl,
	isUnreliable,
	isDuplicate
};
