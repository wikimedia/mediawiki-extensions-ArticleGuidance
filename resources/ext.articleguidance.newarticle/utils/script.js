/**
 * Detect whether a string contains a letter written in a non-Latin script.
 *
 * Used to decide whether a topic-matching query is a candidate for cxserver
 * translation: queries written purely in the Latin script (optionally with
 * digits, punctuation or whitespace) never need translation, while queries
 * containing letters from other scripts (Devanagari, Bengali, Arabic, …) do.
 *
 * @param {string} str
 * @return {boolean}
 */
function containsNonLatin( str ) {
	if ( !str ) {
		return false;
	}
	// Letters from non-Latin scripts: broad ranges covering Greek/Cyrillic, Middle
	// Eastern and Brahmic/South-East Asian scripts (Devanagari, Bengali, Arabic, …),
	// CJK, kana, Hangul, plus Arabic/Hebrew presentation forms. The Latin Extended
	// Additional block (U+1E00–U+1EFF) and the general symbol/punctuation area
	// (U+2000–U+2FFF) are deliberately excluded so Latin text with diacritics or
	// punctuation is not treated as non-Latin.
	return /[\u0370-\u1CFF\u1F00-\u1FFF\u3040-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test( str );
}

module.exports = { containsNonLatin };
