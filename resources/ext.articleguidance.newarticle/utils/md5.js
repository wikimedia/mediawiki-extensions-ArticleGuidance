/* eslint-disable no-bitwise */

/**
 * Compute the MD5 hash of a byte array.
 *
 * @param {Uint8Array} bytes
 * @return {string} Hex-encoded MD5 digest
 */
function md5( bytes ) {
	function safeAdd( x, y ) {
		const lsw = ( x & 0xffff ) + ( y & 0xffff );
		const msw = ( x >> 16 ) + ( y >> 16 ) + ( lsw >> 16 );
		return ( msw << 16 ) | ( lsw & 0xffff );
	}

	function rotl( n, s ) {
		return ( n << s ) | ( n >>> ( 32 - s ) );
	}

	function cmn( q, a, b, x, s, t ) {
		return safeAdd( rotl( safeAdd( safeAdd( a, q ), safeAdd( x, t ) ), s ), b );
	}

	function ff( a, b, c, d, x, s, t ) {
		return cmn( ( b & c ) | ( ~b & d ), a, b, x, s, t );
	}

	function gg( a, b, c, d, x, s, t ) {
		return cmn( ( b & d ) | ( c & ~d ), a, b, x, s, t );
	}

	function hh( a, b, c, d, x, s, t ) {
		return cmn( b ^ c ^ d, a, b, x, s, t );
	}

	function ii( a, b, c, d, x, s, t ) {
		return cmn( c ^ ( b | ~d ), a, b, x, s, t );
	}

	const msgLen = bytes.length;
	const wordCount = ( ( msgLen + 8 ) >> 6 ) + 1;
	const m = new Int32Array( wordCount * 16 );

	for ( let i = 0; i < msgLen; i++ ) {
		m[ i >> 2 ] |= bytes[ i ] << ( ( i & 3 ) * 8 );
	}
	m[ msgLen >> 2 ] |= 0x80 << ( ( msgLen & 3 ) * 8 );
	m[ wordCount * 16 - 2 ] = msgLen * 8;

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;

	for ( let i = 0; i < wordCount * 16; i += 16 ) {
		const a0 = h0;
		const b0 = h1;
		const c0 = h2;
		const d0 = h3;

		h0 = ff( h0, h1, h2, h3, m[ i + 0 ], 7, -680876936 );
		h3 = ff( h3, h0, h1, h2, m[ i + 1 ], 12, -389564586 );
		h2 = ff( h2, h3, h0, h1, m[ i + 2 ], 17, 606105819 );
		h1 = ff( h1, h2, h3, h0, m[ i + 3 ], 22, -1044525330 );
		h0 = ff( h0, h1, h2, h3, m[ i + 4 ], 7, -176418897 );
		h3 = ff( h3, h0, h1, h2, m[ i + 5 ], 12, 1200080426 );
		h2 = ff( h2, h3, h0, h1, m[ i + 6 ], 17, -1473231341 );
		h1 = ff( h1, h2, h3, h0, m[ i + 7 ], 22, -45705983 );
		h0 = ff( h0, h1, h2, h3, m[ i + 8 ], 7, 1770035416 );
		h3 = ff( h3, h0, h1, h2, m[ i + 9 ], 12, -1958414417 );
		h2 = ff( h2, h3, h0, h1, m[ i + 10 ], 17, -42063 );
		h1 = ff( h1, h2, h3, h0, m[ i + 11 ], 22, -1990404162 );
		h0 = ff( h0, h1, h2, h3, m[ i + 12 ], 7, 1804603682 );
		h3 = ff( h3, h0, h1, h2, m[ i + 13 ], 12, -40341101 );
		h2 = ff( h2, h3, h0, h1, m[ i + 14 ], 17, -1502002290 );
		h1 = ff( h1, h2, h3, h0, m[ i + 15 ], 22, 1236535329 );

		h0 = gg( h0, h1, h2, h3, m[ i + 1 ], 5, -165796510 );
		h3 = gg( h3, h0, h1, h2, m[ i + 6 ], 9, -1069501632 );
		h2 = gg( h2, h3, h0, h1, m[ i + 11 ], 14, 643717713 );
		h1 = gg( h1, h2, h3, h0, m[ i + 0 ], 20, -373897302 );
		h0 = gg( h0, h1, h2, h3, m[ i + 5 ], 5, -701558691 );
		h3 = gg( h3, h0, h1, h2, m[ i + 10 ], 9, 38016083 );
		h2 = gg( h2, h3, h0, h1, m[ i + 15 ], 14, -660478335 );
		h1 = gg( h1, h2, h3, h0, m[ i + 4 ], 20, -405537848 );
		h0 = gg( h0, h1, h2, h3, m[ i + 9 ], 5, 568446438 );
		h3 = gg( h3, h0, h1, h2, m[ i + 14 ], 9, -1019803690 );
		h2 = gg( h2, h3, h0, h1, m[ i + 3 ], 14, -187363961 );
		h1 = gg( h1, h2, h3, h0, m[ i + 8 ], 20, 1163531501 );
		h0 = gg( h0, h1, h2, h3, m[ i + 13 ], 5, -1444681467 );
		h3 = gg( h3, h0, h1, h2, m[ i + 2 ], 9, -51403784 );
		h2 = gg( h2, h3, h0, h1, m[ i + 7 ], 14, 1735328473 );
		h1 = gg( h1, h2, h3, h0, m[ i + 12 ], 20, -1926607734 );

		h0 = hh( h0, h1, h2, h3, m[ i + 5 ], 4, -378558 );
		h3 = hh( h3, h0, h1, h2, m[ i + 8 ], 11, -2022574463 );
		h2 = hh( h2, h3, h0, h1, m[ i + 11 ], 16, 1839030562 );
		h1 = hh( h1, h2, h3, h0, m[ i + 14 ], 23, -35309556 );
		h0 = hh( h0, h1, h2, h3, m[ i + 1 ], 4, -1530992060 );
		h3 = hh( h3, h0, h1, h2, m[ i + 4 ], 11, 1272893353 );
		h2 = hh( h2, h3, h0, h1, m[ i + 7 ], 16, -155497632 );
		h1 = hh( h1, h2, h3, h0, m[ i + 10 ], 23, -1094730640 );
		h0 = hh( h0, h1, h2, h3, m[ i + 13 ], 4, 681279174 );
		h3 = hh( h3, h0, h1, h2, m[ i + 0 ], 11, -358537222 );
		h2 = hh( h2, h3, h0, h1, m[ i + 3 ], 16, -722521979 );
		h1 = hh( h1, h2, h3, h0, m[ i + 6 ], 23, 76029189 );
		h0 = hh( h0, h1, h2, h3, m[ i + 9 ], 4, -640364487 );
		h3 = hh( h3, h0, h1, h2, m[ i + 12 ], 11, -421815835 );
		h2 = hh( h2, h3, h0, h1, m[ i + 15 ], 16, 530742520 );
		h1 = hh( h1, h2, h3, h0, m[ i + 2 ], 23, -995338651 );

		h0 = ii( h0, h1, h2, h3, m[ i + 0 ], 6, -198630844 );
		h3 = ii( h3, h0, h1, h2, m[ i + 7 ], 10, 1126891415 );
		h2 = ii( h2, h3, h0, h1, m[ i + 14 ], 15, -1416354905 );
		h1 = ii( h1, h2, h3, h0, m[ i + 5 ], 21, -57434055 );
		h0 = ii( h0, h1, h2, h3, m[ i + 12 ], 6, 1700485571 );
		h3 = ii( h3, h0, h1, h2, m[ i + 3 ], 10, -1894986606 );
		h2 = ii( h2, h3, h0, h1, m[ i + 10 ], 15, -1051523 );
		h1 = ii( h1, h2, h3, h0, m[ i + 1 ], 21, -2054922799 );
		h0 = ii( h0, h1, h2, h3, m[ i + 8 ], 6, 1873313359 );
		h3 = ii( h3, h0, h1, h2, m[ i + 15 ], 10, -30611744 );
		h2 = ii( h2, h3, h0, h1, m[ i + 6 ], 15, -1560198380 );
		h1 = ii( h1, h2, h3, h0, m[ i + 13 ], 21, 1309151649 );
		h0 = ii( h0, h1, h2, h3, m[ i + 4 ], 6, -145523070 );
		h3 = ii( h3, h0, h1, h2, m[ i + 11 ], 10, -1120210379 );
		h2 = ii( h2, h3, h0, h1, m[ i + 2 ], 15, 718787259 );
		h1 = ii( h1, h2, h3, h0, m[ i + 9 ], 21, -343485551 );

		h0 = safeAdd( h0, a0 );
		h1 = safeAdd( h1, b0 );
		h2 = safeAdd( h2, c0 );
		h3 = safeAdd( h3, d0 );
	}

	return [ h0, h1, h2, h3 ].map( ( n ) => {
		let hex = '';
		for ( let j = 0; j < 4; j++ ) {
			hex += ( ( n >>> ( j * 8 ) ) & 0xff ).toString( 16 ).padStart( 2, '0' );
		}
		return hex;
	} ).join( '' );
}

module.exports = { md5 };
