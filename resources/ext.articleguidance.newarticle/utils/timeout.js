/**
 * Error for a promise that does not settle in time.
 */
class TimeoutError extends Error {}

/**
 * Settle like a promise, or reject with a TimeoutError if it does not settle in time.
 *
 * The promise continues after the timeout. Its late result is ignored.
 *
 * @param {Promise} promise Promise to wait for
 * @param {number} duration Time limit, in milliseconds
 * @return {Promise} Settles like promise, or rejects with a TimeoutError
 */
async function withTimeout( promise, duration ) {
	let timer;
	const timeout = new Promise( ( resolve, reject ) => {
		timer = setTimeout( () => reject( new TimeoutError() ), duration );
	} );
	try {
		return await Promise.race( [ promise, timeout ] );
	} finally {
		clearTimeout( timer );
	}
}

module.exports = { withTimeout, TimeoutError };
