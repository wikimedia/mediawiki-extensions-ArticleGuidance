#!/usr/bin/env node
// refresh-outlines.js — Force-refresh the parser cache and page_props for all
// ArticleGuidance outline pages on a target wiki via the Action API.
//
// Each page is purged with forcelinkupdate=1, which invalidates the parser
// cache AND forces MediaWiki to re-parse the page and run a LinksUpdate
// (writing up-to-date Wikidata data into page_props). A plain purge is not
// enough: page_props is only rewritten by a LinksUpdate.
//
// The link update is dispatched with defer => PRESEND, so it completes within
// the purge request itself; there is no job queue to wait on afterwards.
//
// Usage:
//   node scripts/refresh-outlines.js \
//     --url https://wiki.example.org \
//     [--category "Pages using ArticleGuidance"] \
//     [--user Admin@SeedBot] \
//     [--password <bot-password>] \
//     [--sleep-per-batch 3000] \
//     [--max-retries 2] \
//     [--dry-run]

'use strict';

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const USAGE = 'Usage: node refresh-outlines.js --url <url> [--category <name>] ' +
	'[--user <user>] [--password <password>] [--sleep-per-batch <ms>] ' +
	'[--max-retries <n>] [--dry-run] [--interactive]';

/** The 'linkpurge' rate limit window, and so also the backoff after a refusal. */
const RATE_LIMIT_WINDOW_MS = 60000;

/**
 * Milliseconds between purges, named after the core maintenance-script option
 * (see purgeChangedPages.php). 3000 gives 20 per minute, clear of the default
 * limit of 30 per 60s.
 */
const DEFAULT_SLEEP_PER_BATCH_MS = 3000;

const args = process.argv.slice( 2 );
const opts = {
	url: '',
	category: '',
	user: '',
	password: '',
	sleepPerBatch: DEFAULT_SLEEP_PER_BATCH_MS,
	maxRetries: 2,
	dryRun: false,
	interactive: false
};

/**
 * Parse an argument that must be a non-negative integer.
 *
 * @param {string} flag Flag name, for the error message
 * @param {string|undefined} value Raw argument value
 * @return {number}
 */
function parseCount( flag, value ) {
	const parsed = Number( value );
	if ( !Number.isInteger( parsed ) || parsed < 0 ) {
		console.error( `${ flag } must be a non-negative integer, got: ${ value }` );
		console.error( USAGE );
		throw new Error( 'Invalid arguments' );
	}
	return parsed;
}

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
		case '--sleep-per-batch':
			opts.sleepPerBatch = parseCount( '--sleep-per-batch', args[ ++i ] );
			break;
		case '--max-retries':
			opts.maxRetries = parseCount( '--max-retries', args[ ++i ] );
			break;
		case '--dry-run':
			opts.dryRun = true;
			break;
		case '--interactive':
			opts.interactive = true;
			break;
		default:
			console.error( `Unknown argument: ${ args[ i ] }` );
			console.error( USAGE );
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

// Spacing between purges. --sleep-per-batch 0 disables pacing entirely.
const throttleMs = opts.sleepPerBatch;

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
// Pacing helpers
// ---------------------------------------------------------------------------

/**
 * Describe how long a throttled run of the given size will take.
 *
 * @param {number} pageCount
 * @return {string}
 */
function describePacing( pageCount ) {
	if ( throttleMs === 0 ) {
		return `${ pageCount } page(s), unthrottled (--sleep-per-batch 0)`;
	}
	const pacing = `${ throttleMs }ms apart (~${ Math.round( RATE_LIMIT_WINDOW_MS / throttleMs ) }/min)`;
	// Pacing only inserts gaps *between* pages, so a single page waits for none.
	const seconds = Math.round( ( pageCount - 1 ) * throttleMs / 1000 );
	if ( seconds === 0 ) {
		return `${ pageCount } page(s) ${ pacing }`;
	}
	const eta = seconds < 90 ?
		`${ seconds }s` :
		`${ Math.round( seconds / 60 ) } min`;
	return `${ pageCount } page(s) ${ pacing } — about ${ eta }`;
}

/**
 * Flatten the API warnings block into a single line for logging.
 *
 * The purge request uses the default (BC) output format, where warnings are
 * keyed by module with the text under '*'. Newer error formats put it under
 * 'warnings' instead, so both are handled.
 *
 * @param {Object} data Parsed API response
 * @return {string|null} Warning text, or null if the response carried none
 */
function formatWarnings( data ) {
	const warnings = data && data.warnings;
	if ( !warnings ) {
		return null;
	}
	const messages = [];
	for ( const [ module, value ] of Object.entries( warnings ) ) {
		const text = typeof value === 'string' ? value : ( value && ( value[ '*' ] || value.warnings ) );
		if ( text ) {
			messages.push( `${ module }: ${ text }` );
		}
	}
	return messages.length > 0 ? messages.join( '; ' ) : null;
}

// ---------------------------------------------------------------------------
// Interactive helpers
// ---------------------------------------------------------------------------

const green = ( s ) => `\x1b[32m${ s }\x1b[0m`;
const yellow = ( s ) => `\x1b[33m${ s }\x1b[0m`;
const red = ( s ) => `\x1b[31m${ s }\x1b[0m`;

function delay( ms ) {
	return new Promise( ( resolve ) => {
		setTimeout( resolve, ms );
	} );
}

function pressAnyKey() {
	process.stdout.write( '  Press any key to continue, or Ctrl+C to abort…' );
	return new Promise( ( resolve, reject ) => {
		process.stdin.setRawMode( true );
		process.stdin.resume();
		process.stdin.once( 'data', ( key ) => {
			if ( key[ 0 ] === 3 ) {
				process.stdout.write( '\n' );
				process.stdin.setRawMode( false );
				process.stdin.pause();
				reject( new Error( 'Aborted.' ) );
				return;
			}
			process.stdin.setRawMode( false );
			process.stdin.pause();
			process.stdout.write( '\n' );
			resolve();
		} );
	} );
}

async function validateOutline( title ) {
	const restUrl = `${ baseUrl }/w/rest.php/articleguidance/v1/outlines`;
	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	const restResponse = await fetch( restUrl, {
		headers: { 'User-Agent': USER_AGENT, Cookie: serializeCookies() }
	} );
	if ( !restResponse.ok ) {
		return { ok: false, reason: `REST API returned HTTP ${ restResponse.status }` };
	}
	const restData = await restResponse.json();
	const outlines = restData.outlines || [];
	const outline = outlines.find( ( o ) => o.title === title );
	if ( !outline ) {
		return { ok: false, reason: 'outline not found in REST API response' };
	}
	const missing = [];
	if ( !outline.title ) {
		missing.push( 'title' );
	}
	if ( !outline.label ) {
		missing.push( 'label' );
	}
	if ( !outline.description ) {
		missing.push( 'description' );
	}
	if ( !Array.isArray( outline.articleTypes ) || outline.articleTypes.length === 0 ) {
		missing.push( 'articleTypes' );
	} else if ( outline.articleTypes.some(
		( t ) => !t.id || typeof t.hierarchyDepth !== 'number'
	) ) {
		missing.push( 'articleTypes[].id/hierarchyDepth' );
	}
	if ( missing.length > 0 ) {
		return { ok: false, warn: true, reason: `missing or empty fields: ${ missing.join( ', ' ) }` };
	}
	return { ok: true, outline };
}

// ---------------------------------------------------------------------------
// Purging
// ---------------------------------------------------------------------------

/**
 * Purge one page and force its link update.
 *
 * ApiPurge reports 'linkupdate' only when the link update actually ran. When
 * the rate limit is hit it drops the update, adds a warning, and still reports
 * the page as purged — so 'purged' on its own does not mean page_props was
 * rewritten. 'linkupdate' is the signal that matters, and it implies the
 * parser cache was refreshed too, because ApiPurge calls updateParserCache()
 * in the same branch.
 *
 * Presence is tested rather than equality: the request uses the default (BC)
 * output format, where a boolean true is rendered as an empty string.
 *
 * @param {string} title
 * @return {Promise<{status: string, warnings: ?string}>} status is one of
 *   'ok', 'refused', 'missing' or 'invalid'
 */
async function purgeWithLinkUpdate( title ) {
	const data = await apiPost( {
		action: 'purge',
		titles: title,
		forcelinkupdate: '1',
		format: 'json'
	} );
	const item = data.purge && data.purge[ 0 ];
	const warnings = formatWarnings( data );

	// Presence, not truthiness: ApiPageSet sets these to true, which the BC
	// formatter renders as an empty string.
	if ( !item || item.invalid !== undefined ) {
		return { status: 'invalid', warnings };
	}
	if ( item.missing !== undefined ) {
		return { status: 'missing', warnings };
	}
	return {
		status: item.linkupdate !== undefined ? 'ok' : 'refused',
		warnings
	};
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
		console.log( `[dry-run] Would purge ${ describePacing( titles.length ) }.` );
		return;
	}

	// -------------------------------------------------------------------------
	// Step 5: Purge then re-parse each page sequentially
	// -------------------------------------------------------------------------
	let refreshedCount = 0;
	let refusedCount = 0;
	let missingCount = 0;
	let errorCount = 0;

	console.log( `Purging ${ describePacing( titles.length ) }.` );

	for ( let i = 0; i < titles.length; i++ ) {
		const title = titles[ i ];
		const progress = `[${ i + 1 }/${ titles.length }]`;

		// Pace the run below the rate limit. Interactive mode is already gated
		// on a keypress, so it needs no extra spacing.
		if ( i > 0 && throttleMs > 0 && !opts.interactive ) {
			await delay( throttleMs );
		}

		console.log( `${ progress } ${ title }` );

		if ( opts.interactive ) {
			await pressAnyKey();
		}

		// Purge, retrying once per rate-limit window if the link update is
		// refused. A refusal that survives a full window is unlikely to be
		// throttling.
		let purgeResult;
		for ( let attempt = 0; attempt <= opts.maxRetries; attempt++ ) {
			if ( attempt > 0 ) {
				console.warn( yellow(
					`  refused — waiting ${ RATE_LIMIT_WINDOW_MS / 1000 }s before retry (${ attempt }/${ opts.maxRetries })`
				) );
				await delay( RATE_LIMIT_WINDOW_MS );
			}

			try {
				purgeResult = await purgeWithLinkUpdate( title );
			} catch ( err ) {
				purgeResult = { status: 'error', warnings: null, message: err.message };
			}

			if ( purgeResult.status !== 'refused' ) {
				break;
			}
			if ( purgeResult.warnings ) {
				console.warn( yellow( `  ${ purgeResult.warnings }` ) );
			}
		}

		if ( purgeResult.status === 'missing' ) {
			console.warn( '  ! page not found, skipping' );
			missingCount++;
			continue;
		}
		if ( purgeResult.status === 'invalid' ) {
			console.error( red( '  ✗ purge failed — invalid title' ) );
			errorCount++;
			continue;
		}
		if ( purgeResult.status === 'error' ) {
			console.error( red( `  ✗ purge error: ${ purgeResult.message }` ) );
			errorCount++;
			continue;
		}
		if ( purgeResult.status === 'refused' ) {
			console.error( red( '  ✗ purged, but the link update was refused — page_props NOT rewritten' ) );
			if ( opts.maxRetries > 0 ) {
				console.error( red(
					'    Still refused after a full rate-limit window, so this is more likely a missing' +
					' linkpurge right than throttling. Try --user/--password with a privileged account.'
				) );
			}
			refusedCount++;
			continue;
		}

		console.log( '  purged + link update' );
		refreshedCount++;

		if ( opts.interactive ) {
			await delay( 2000 );
			try {
				const result = await validateOutline( title );
				if ( result.ok ) {
					const depths = result.outline.articleTypes
						.map( ( t ) => `${ t.id }: ${ t.hierarchyDepth }` )
						.join( ', ' );
					console.log( green( `  ✓ outline validated (hierarchyDepth: ${ depths })` ) );
				} else if ( result.warn ) {
					console.warn( yellow( `  ⚠ incomplete data — ${ result.reason }` ) );
				} else {
					console.error( red( `  ✗ ${ result.reason }` ) );
				}
			} catch ( err ) {
				console.error( red( `  ✗ validation error: ${ err.message }` ) );
			}
		}
	}

	// -------------------------------------------------------------------------
	// Step 6: Summary
	// -------------------------------------------------------------------------
	console.log( '' );
	console.log(
		`Done. ${ refreshedCount } page(s) refreshed, ${ refusedCount } refused, ` +
		`${ missingCount } not found, ${ errorCount } error(s).`
	);

	// A refusal means the page was purged but page_props was left stale, which
	// is the exact failure this script exists to prevent. It is not a success.
	if ( errorCount > 0 || refusedCount > 0 ) {
		throw new Error( `${ errorCount + refusedCount } page(s) failed to refresh.` );
	}

	// -------------------------------------------------------------------------
	// Step 7: Verify outlines are served by the REST API
	// -------------------------------------------------------------------------
	console.log( '' );
	console.log( 'Verifying outlines REST API…' );
	try {
		const restUrl = `${ baseUrl }/w/rest.php/articleguidance/v1/outlines`;
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
