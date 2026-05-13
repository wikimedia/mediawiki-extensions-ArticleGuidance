#!/usr/bin/env node
// refresh-outlines.js — Force-refresh the parser cache and page_props for all
// ArticleGuidance outline pages on a target wiki via the Action API.
//
// Each page is purged with forcelinkupdate=1, which invalidates the parser
// cache AND forces MediaWiki to re-parse the page and run a LinksUpdate
// (writing up-to-date Wikidata data into page_props).
//
// Usage:
//   node scripts/refresh-outlines.js \
//     --url https://wiki.example.org \
//     [--category "Pages using ArticleGuidance"] \
//     [--user Admin@SeedBot] \
//     [--password <bot-password>] \
//     [--dry-run]

'use strict';

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice( 2 );
const opts = {
	url: '',
	category: '',
	user: '',
	password: '',
	dryRun: false
};

for ( let i = 0; i < args.length; i++ ) {
	switch ( args[ i ] ) {
		case '--url':
			opts.url = args[ ++i ];
			break;
		case '--category':
			opts.category = args[ ++i ];
			break;
		case '--user':
			opts.user = args[ ++i ];
			break;
		case '--password':
			opts.password = args[ ++i ];
			break;
		case '--dry-run':
			opts.dryRun = true;
			break;
		default:
			console.error( `Unknown argument: ${ args[ i ] }` );
			console.error( 'Usage: node refresh-outlines.js --url <url> [--category <name>] [--user <user>] [--password <password>] [--dry-run]' );
			throw new Error( 'Invalid arguments' );
	}
}

// ---------------------------------------------------------------------------
// Validate required arguments
// ---------------------------------------------------------------------------
if ( !opts.url ) {
	throw new Error( '--url is required.' );
}

if ( ( opts.user && !opts.password ) || ( !opts.user && opts.password ) ) {
	console.warn( 'Warning: --user and --password should be provided together. Proceeding without authentication.' );
	opts.user = '';
	opts.password = '';
}

const baseUrl = opts.url.replace( /\/$/, '' );
const apiUrl = baseUrl + '/w/api.php';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const USER_AGENT = 'MediaWiki/ArticleGuidance language-product-localization@wikimedia.org';

/** Shared cookie store (name → value). */
const cookies = new Map();

function serializeCookies() {
	return [ ...cookies.entries() ].map( ( [ k, v ] ) => `${ k }=${ v }` ).join( '; ' );
}

function storeCookies( response ) {
	const headers = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
	for ( const header of headers ) {
		const [ pair ] = header.split( ';' );
		const eq = pair.indexOf( '=' );
		if ( eq !== -1 ) {
			cookies.set( pair.slice( 0, eq ).trim(), pair.slice( eq + 1 ).trim() );
		}
	}
}

async function apiGet( params ) {
	const url = new URL( apiUrl );
	for ( const [ k, v ] of Object.entries( params ) ) {
		url.searchParams.set( k, v );
	}
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	const response = await fetch( url.toString(), {
		headers: { 'User-Agent': USER_AGENT, Cookie: serializeCookies() }
	} );
	storeCookies( response );
	if ( !response.ok ) {
		throw new Error( `HTTP ${ response.status } ${ response.statusText } for GET ${ url }` );
	}
	return response.json();
}

async function apiPost( params ) {
	const body = new URLSearchParams( params );
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	const response = await fetch( apiUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': USER_AGENT,
			Cookie: serializeCookies()
		},
		body: body.toString()
	} );
	storeCookies( response );
	if ( !response.ok ) {
		throw new Error( `HTTP ${ response.status } ${ response.statusText } for POST ${ apiUrl }` );
	}
	return response.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
	// -------------------------------------------------------------------------
	// Step 1: Resolve category name
	// -------------------------------------------------------------------------
	let categoryName = opts.category;
	if ( !categoryName ) {
		console.log( 'Resolving category name from wiki messages…' );
		const data = await apiGet( {
			action: 'query',
			meta: 'allmessages',
			ammessages: 'articleguidance-tracking-category',
			format: 'json'
		} );
		categoryName = data.query &&
			data.query.allmessages &&
			data.query.allmessages[ 0 ] &&
			data.query.allmessages[ 0 ][ '*' ];
		if ( !categoryName ) {
			throw new Error( 'Could not resolve articleguidance-tracking-category message from wiki.' );
		}
		console.log( `  Category: ${ categoryName }` );
	}

	// -------------------------------------------------------------------------
	// Step 2: Authenticate (optional)
	// -------------------------------------------------------------------------
	if ( opts.user && opts.password ) {
		console.log( 'Fetching login token…' );
		const tokenData = await apiGet( {
			action: 'query',
			meta: 'tokens',
			type: 'login',
			format: 'json'
		} );
		const loginToken = tokenData.query &&
			tokenData.query.tokens &&
			tokenData.query.tokens.logintoken;
		if ( !loginToken ) {
			throw new Error( 'Could not retrieve login token.' );
		}

		console.log( `Logging in as ${ opts.user }…` );
		const loginData = await apiPost( {
			action: 'login',
			lgname: opts.user,
			lgpassword: opts.password,
			lgtoken: loginToken,
			format: 'json'
		} );
		if ( !loginData.login || loginData.login.result !== 'Success' ) {
			const result = loginData.login && loginData.login.result || 'unknown';
			throw new Error( `Login failed (result: ${ result }).` );
		}
		console.log( 'Login successful.' );
	}

	// -------------------------------------------------------------------------
	// Step 3: List category members (paginated)
	// -------------------------------------------------------------------------
	console.log( `Listing members of Category:${ categoryName }…` );
	const titles = [];
	let cmcontinue = null;

	do {
		const params = {
			action: 'query',
			list: 'categorymembers',
			cmtitle: `Category:${ categoryName }`,
			cmlimit: '500',
			format: 'json'
		};
		if ( cmcontinue ) {
			params.continue = '-||';
			params.cmcontinue = cmcontinue;
		}

		const data = await apiGet( params );
		const members = data.query && data.query.categorymembers || [];
		for ( const member of members ) {
			titles.push( member.title );
		}
		cmcontinue = data.continue && data.continue.cmcontinue || null;
	} while ( cmcontinue );

	console.log( `  Found ${ titles.length } page(s).` );

	if ( titles.length === 0 ) {
		console.log( 'Nothing to refresh.' );
		return;
	}

	// -------------------------------------------------------------------------
	// Step 4: Dry-run gate
	// -------------------------------------------------------------------------
	if ( opts.dryRun ) {
		console.log( '[dry-run] Pages that would be purged and refreshed:' );
		for ( const title of titles ) {
			console.log( `  ${ title }` );
		}
		return;
	}

	// -------------------------------------------------------------------------
	// Step 5: Purge then re-parse each page sequentially
	// -------------------------------------------------------------------------
	let purgedCount = 0;
	let missingCount = 0;
	let errorCount = 0;

	for ( let i = 0; i < titles.length; i++ ) {
		const title = titles[ i ];
		const progress = `[${ i + 1 }/${ titles.length }]`;
		console.log( `${ progress } ${ title }` );

		// Purge
		let purgeOk = false;
		try {
			const data = await apiPost( {
				action: 'purge',
				titles: title,
				forcelinkupdate: '1',
				format: 'json'
			} );
			const item = data.purge && data.purge[ 0 ];
			if ( !item || item.invalid ) {
				console.error( '  ✗ purge failed — invalid title' );
				errorCount++;
			} else if ( item.missing !== undefined ) {
				console.warn( '  ! page not found, skipping' );
				missingCount++;
			} else if ( item.purged !== undefined ) {
				console.log( '  purged' );
				purgedCount++;
				purgeOk = true;
			} else {
				console.error( '  ✗ purge failed — unexpected response' );
				errorCount++;
			}
		} catch ( err ) {
			console.error( `  ✗ purge error: ${ err.message }` );
			errorCount++;
		}

		if ( !purgeOk ) {
			continue;
		}
	}

	// -------------------------------------------------------------------------
	// Step 6: Summary
	// -------------------------------------------------------------------------
	console.log( '' );
	console.log( `Done. ${ purgedCount } page(s) purged, ${ missingCount } not found, ${ errorCount } error(s).` );

	if ( errorCount > 0 ) {
		throw new Error( `${ errorCount } error(s) encountered.` );
	}

	// -------------------------------------------------------------------------
	// Step 7: Verify outlines are served by the REST API
	// -------------------------------------------------------------------------
	console.log( '' );
	console.log( 'Verifying outlines REST API…' );
	try {
		const restUrl = `${ baseUrl }/w/rest.php/articleguidance/v0/outlines`;
		// eslint-disable-next-line n/no-unsupported-features/node-builtins
		const restResponse = await fetch( restUrl, {
			headers: { 'User-Agent': USER_AGENT, Cookie: serializeCookies() }
		} );
		if ( !restResponse.ok ) {
			console.warn( `  ⚠ REST API returned HTTP ${ restResponse.status }` );
		} else {
			const restData = await restResponse.json();
			const outlineCount = restData.outlines ? restData.outlines.length : 0;
			if ( outlineCount === 0 ) {
				console.warn( '  ⚠ REST API returned 0 outlines — link updates may still be queued.' );
				console.warn( '    Try running: php maintenance/runJobs.php on the wiki server.' );
			} else {
				console.log( `  ✓ REST API returned ${ outlineCount } outline(s).` );
			}
		}
	} catch ( err ) {
		console.warn( `  ⚠ Could not verify REST API: ${ err.message }` );
	}
}

main().catch( ( err ) => {
	console.error( `Fatal: ${ err.message }` );
	process.exitCode = 1;
} );
