/**
 * Make the links in an HTML string open in a new tab.
 *
 * Use this for HTML that shows inside the wizard, so that a click on a link
 * does not move the user away from the wizard. Links to a fragment on the
 * same page stay the same.
 *
 * @param {string} html HTML to change
 * @return {string} HTML with target="_blank" and rel="noopener noreferrer" on each link
 */
function openLinksInNewTab( html ) {
	// A template element parses the HTML without loading images or running scripts
	const template = document.createElement( 'template' );
	template.innerHTML = html;
	Array.prototype.forEach.call(
		template.content.querySelectorAll( 'a[href]:not([href^="#"])' ),
		( link ) => {
			link.setAttribute( 'target', '_blank' );
			link.setAttribute( 'rel', 'noopener noreferrer' );
		}
	);
	return template.innerHTML;
}

module.exports = { openLinksInNewTab };
