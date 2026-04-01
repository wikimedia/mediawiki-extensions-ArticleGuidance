/**
 * @return {boolean} Whether the current view is mobile
 */
function isMobile() {
	return mw.config.get( 'wgMFMode' ) !== null;
}

module.exports = { isMobile };
