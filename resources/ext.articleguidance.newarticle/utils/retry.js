const RETRY_DELAY_MIN = 50;
const RETRY_DELAY_MAX = 250;

/**
 * Call an async function, retrying once after a random short delay if it throws.
 *
 * @param {Function} fn - Async function to call
 * @return {Promise} Result of fn
 */
async function withRetry( fn ) {
	try {
		return await fn();
	} catch ( err ) {
		const delay = RETRY_DELAY_MIN +
			Math.floor( Math.random() * ( RETRY_DELAY_MAX - RETRY_DELAY_MIN + 1 ) );
		await new Promise( ( resolve ) => {
			setTimeout( resolve, delay );
		} );
		return fn();
	}
}

module.exports = { withRetry };
