#!/usr/bin/env node
// fetch-outlines.js — Download all ArticleGuidance outline pages from a wiki
// into the local outlines/ directory, replacing any existing files.
//
// Each outline page is written to outlines/ as a .txt file named after the
// part of the page title after the last slash (e.g. "Wikipedia:Article
// guidance/Actor" becomes "Actor.txt"). Local files with no matching wiki page
// are removed via `git rm`.
//
// Usage:
//   node scripts/fetch-outlines.js \
//     --url https://wiki.example.org \
//     [--category "Pages using ArticleGuidance"] \
//     [--user Admin@SeedBot] \
//     [--password <bot-password>] \
//     [--dry-run]

'use strict';

const fs = require( 'fs' );
const path = require( 'path' );
const { execSync } = require( 'child_process' );

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
			console.error( 'Usage: node fetch-outlines.js --url <url> [--category <name>] [--user <user>] [--password <password>] [--dry-run]' );
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
const outlinesDir = path.resolve( __dirname, '..', 'outlines' );

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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
		headers: { Cookie: serializeCookies() }
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
		console.log( 'Nothing to fetch.' );
		return;
	}

	// -------------------------------------------------------------------------
	// Step 4: Build set of expected filenames and snapshot existing files
	// -------------------------------------------------------------------------
	const fetchedFilenames = new Set();
	for ( const title of titles ) {
		fetchedFilenames.add( title.slice( title.lastIndexOf( '/' ) + 1 ) + '.txt' );
	}

	const existingFilenames = new Set(
		fs.existsSync( outlinesDir ) ?
			fs.readdirSync( outlinesDir ).filter( ( f ) => f.endsWith( '.txt' ) ) :
			[]
	);

	// -------------------------------------------------------------------------
	// Step 5: Dry-run gate
	// -------------------------------------------------------------------------
	if ( opts.dryRun ) {
		console.log( '[dry-run] Pages that would be fetched:' );
		for ( const title of titles ) {
			const filename = title.slice( title.lastIndexOf( '/' ) + 1 ) + '.txt';
			console.log( `  ${ title } → outlines/${ filename }` );
		}
		const dryRunToRemove = [ ...existingFilenames ]
			.filter( ( f ) => !fetchedFilenames.has( f ) );
		if ( dryRunToRemove.length > 0 ) {
			console.log( '[dry-run] Files that would be removed (not on wiki):' );
			for ( const f of dryRunToRemove ) {
				console.log( `  outlines/${ f }` );
			}
		}
		return;
	}

	// -------------------------------------------------------------------------
	// Step 6: Fetch and write each page
	// -------------------------------------------------------------------------
	fs.mkdirSync( outlinesDir, { recursive: true } );

	let writtenCount = 0;
	let missingCount = 0;
	let errorCount = 0;
	const writtenFilenames = new Set();
	const retryTitles = [];

	async function fetchTitle( title, progress ) {
		const filename = title.slice( title.lastIndexOf( '/' ) + 1 ) + '.txt';
		console.log( `${ progress } ${ title } → ${ filename }` );

		const data = await apiGet( {
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			rvslots: 'main',
			titles: title,
			format: 'json'
		} );

		const pages = data.query && data.query.pages;
		const page = pages && Object.values( pages )[ 0 ];

		if ( !page || page.missing !== undefined ) {
			console.warn( '  ! page not found, skipping' );
			return 'missing';
		}

		const content = page.revisions &&
			page.revisions[ 0 ] &&
			page.revisions[ 0 ].slots &&
			page.revisions[ 0 ].slots.main &&
			page.revisions[ 0 ].slots.main[ '*' ];

		if ( content === undefined || content === null ) {
			console.error( '  ✗ could not extract page content' );
			return 'error';
		}

		fs.writeFileSync( path.join( outlinesDir, filename ), content, 'utf8' );
		console.log( '  written' );
		writtenFilenames.add( filename );
		return 'ok';
	}

	for ( let i = 0; i < titles.length; i++ ) {
		const title = titles[ i ];
		const progress = `[${ i + 1 }/${ titles.length }]`;
		try {
			const result = await fetchTitle( title, progress );
			if ( result === 'ok' ) {
				writtenCount++;
			} else if ( result === 'missing' ) {
				missingCount++;
			} else {
				retryTitles.push( title );
			}
		} catch ( err ) {
			console.error( `  ✗ error: ${ err.message }` );
			retryTitles.push( title );
		}
	}

	// -------------------------------------------------------------------------
	// Step 7: Retry errored pages
	// -------------------------------------------------------------------------
	if ( retryTitles.length > 0 ) {
		console.log( '' );
		console.log( `Retrying ${ retryTitles.length } failed page(s)…` );
		const stillFailing = [];
		for ( let i = 0; i < retryTitles.length; i++ ) {
			const title = retryTitles[ i ];
			const progress = `[${ i + 1 }/${ retryTitles.length }]`;
			try {
				const result = await fetchTitle( title, progress );
				if ( result === 'ok' ) {
					writtenCount++;
				} else if ( result === 'missing' ) {
					missingCount++;
				} else {
					stillFailing.push( title );
				}
			} catch ( err ) {
				console.error( `  ✗ error: ${ err.message }` );
				stillFailing.push( title );
			}
		}
		errorCount = stillFailing.length;
	}

	// -------------------------------------------------------------------------
	// Step 7: git rm files that were not updated from the wiki
	// -------------------------------------------------------------------------
	const toRemove = [ ...existingFilenames ].filter( ( f ) => !writtenFilenames.has( f ) );
	if ( toRemove.length > 0 ) {
		console.log( '' );
		console.log( `Removing ${ toRemove.length } local file(s) no longer on wiki…` );
		for ( const f of toRemove ) {
			const filePath = `outlines/${ f }`;
			try {
				execSync( `git rm -f ${ filePath }`, { stdio: 'pipe' } );
				console.log( `  removed ${ filePath }` );
			} catch ( err ) {
				console.warn( `  Warning: git rm failed for ${ filePath } (${ err.message.trim() })` );
			}
		}
	}

	// -------------------------------------------------------------------------
	// Step 8: Summary
	// -------------------------------------------------------------------------
	console.log( '' );
	console.log( `Done. ${ writtenCount } file(s) written, ${ toRemove.length } removed, ${ missingCount } not found, ${ errorCount } error(s).` );

	if ( errorCount > 0 ) {
		throw new Error( `${ errorCount } error(s) encountered.` );
	}
}

main().catch( ( err ) => {
	console.error( `Fatal: ${ err.message }` );
	process.exitCode = 1;
} );
