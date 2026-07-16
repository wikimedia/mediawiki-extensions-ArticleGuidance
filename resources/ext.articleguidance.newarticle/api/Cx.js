/**
 * Machine translation via cxserver (the Content Translation server), which
 * proxies the MinT machine-translation provider. The standalone MinT instance
 * is not reachable from production, so translation goes through cxserver's
 * /v1/mt/{from}/{to}/MinT endpoint instead.
 *
 * Used as a fallback in topic matching: when a user searches in a non-Latin
 * script, the query is translated to English so Wikidata items that only have
 * English labels can still be matched.
 *
 * The server URL and target language are read from configuration.
 */

const config = require( '../config.json' );

// Abort the translation request if cxserver does not respond in time, so a slow
// or unresponsive service never blocks the search results.
const TRANSLATE_TIMEOUT_MS = 10000;

/**
 * Escape the characters that would otherwise break the HTML wrapping we send to
 * cxserver, which expects an HTML document as input.
 *
 * @param {string} text Text to escape
 * @return {string} HTML-escaped text
 */
function escapeHtml( text ) {
	return text
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

/**
 * Translate a query string via cxserver (MinT provider).
 *
 * @param {string} text Text to translate
 * @param {string} sourceLang Source language code (e.g. 'bn')
 * @param {string} [targetLang] Target language code; defaults to the configured
 *   target language (English)
 * @return {Promise<string|null>} The translated text, or null when translation
 *   is disabled, unavailable, empty, or fails
 */
async function translateQuery( text, sourceLang, targetLang ) {
	const trimmed = text ? text.trim() : '';
	const target = targetLang || config.ArticleGuidanceCxTargetLanguage || 'en';
	const cxServerUrl = config.ArticleGuidanceCxServerUrl;
	if ( !trimmed || !sourceLang || sourceLang === target || !cxServerUrl ) {
		return null;
	}

	const url = cxServerUrl + '/' + sourceLang + '/' + target + '/MinT';

	try {
		const data = await $.ajax( {
			url: url,
			method: 'POST',
			contentType: 'application/json',
			dataType: 'json',
			// jQuery aborts the underlying request when this elapses.
			timeout: TRANSLATE_TIMEOUT_MS,
			data: JSON.stringify( {
				html: '<p>' + escapeHtml( trimmed ) + '</p>'
			} )
		} );

		// cxserver returns the translation as an HTML document; extract the plain
		// text safely (DOMParser does not execute scripts, unlike $.html()).
		const html = data && typeof data.html === 'string' ? data.html : '';
		const doc = new DOMParser().parseFromString( html, 'text/html' );
		const translation = ( doc.body.textContent || '' ).trim();
		return translation || null;
	} catch ( error ) {
		return null;
	}
}

module.exports = { translateQuery };
