/**
 * Scroll the window to the top of the page.
 *
 * Used when navigating to a new step or when loading the outlines
 * list into view, to ensure the user sees the new content without
 * needing to scroll manually.
 */
function scrollToTop() {
	if ( typeof window !== 'undefined' ) {
		scrollTo( 0, 0 );
	}
}

module.exports = {
	scrollToTop
};
