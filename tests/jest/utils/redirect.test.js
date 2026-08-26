'use strict';

const MODULE = '../../../resources/ext.articleguidance.newarticle/utils/redirect.js';

/**
 * Stub mw.Title with the normalisation rules of a wiki whose main namespace
 * capitalises the first letter ($wgCapitalLinks = true, the default).
 */
function mockCapitalisingTitle() {
	global.mw = {
		Title: {
			newFromText: ( text ) => {
				const t = String( text ).replace( /_/g, ' ' ).trim();
				if ( !t ) {
					return null;
				}
				const db = ( t.charAt( 0 ).toUpperCase() + t.slice( 1 ) ).replace( / /g, '_' );
				return { getPrefixedDb: () => db };
			}
		}
	};
}

/**
 * Stub mw.Title for a wiki with a case-sensitive main namespace
 * ($wgCapitalLinks = false), as Wiktionaries run.
 */
function mockCaseSensitiveTitle() {
	global.mw = {
		Title: {
			newFromText: ( text ) => {
				const t = String( text ).replace( /_/g, ' ' ).trim();
				return t ? { getPrefixedDb: () => t.replace( / /g, '_' ) } : null;
			}
		}
	};
}

describe( 'queryUnchanged', () => {
	let queryUnchanged;

	beforeEach( () => {
		( { queryUnchanged } = require( MODULE ) );
	} );

	it( 'ignores underscores, surrounding space and case', () => {
		expect( queryUnchanged( ' New_York_City ', 'new york city' ) ).toBe( true );
	} );

	it( 'rejects a different query', () => {
		expect( queryUnchanged( 'NYC', 'Paris' ) ).toBe( false );
	} );

	it( 'treats an empty or missing red-link title as no match', () => {
		expect( queryUnchanged( null, 'NYC' ) ).toBe( false );
		expect( queryUnchanged( '  ', '' ) ).toBe( false );
	} );
} );

describe( 'isSamePage', () => {
	let isSamePage;

	beforeEach( () => {
		( { isSamePage } = require( MODULE ) );
	} );

	it( 'treats underscores and spaces as the same title', () => {
		mockCapitalisingTitle();
		expect( isSamePage( 'New_York_City', 'New York City' ) ).toBe( true );
	} );

	it( 'capitalises the first letter where the wiki does', () => {
		mockCapitalisingTitle();
		expect( isSamePage( 'dog', 'Dog' ) ).toBe( true );
	} );

	it( 'does not capitalise the first letter where the wiki does not', () => {
		// Proves the rule comes from mw.Title, not from this module.
		mockCaseSensitiveTitle();
		expect( isSamePage( 'dog', 'Dog' ) ).toBe( false );
	} );

	it( 'never changes anything past the first letter', () => {
		mockCapitalisingTitle();
		expect( isSamePage( 'Naughty dog', 'Naughty Dog' ) ).toBe( false );
	} );

	it( 'returns false when either side is not a usable title', () => {
		mockCapitalisingTitle();
		expect( isSamePage( '', 'Dog' ) ).toBe( false );
		expect( isSamePage( 'Dog', null ) ).toBe( false );
	} );
} );

describe( 'isRedirectOfferable', () => {
	let isRedirectOfferable;

	beforeEach( () => {
		mockCapitalisingTitle();
		( { isRedirectOfferable } = require( MODULE ) );
	} );

	it( 'offers the redirect for an untouched red-link query', () => {
		expect( isRedirectOfferable( 'NYC', 'NYC', 'New York City', false ) )
			.toBe( true );
	} );

	it( 'offers a capitalisation-variant redirect', () => {
		// The common case this feature exists to serve, and the one a full
		// lowercase comparison used to hide.
		expect( isRedirectOfferable( 'Naughty dog', 'Naughty dog', 'Naughty Dog', false ) )
			.toBe( true );
	} );

	it( 'ignores underscore and case differences between query and red link', () => {
		expect( isRedirectOfferable( 'New_York_city', 'New York City', 'NYC', false ) )
			.toBe( true );
	} );

	it( 'declines once the red-link title exists', () => {
		// Reloading the page after a successful creation rebuilds identical state,
		// so only the title's existence distinguishes the two cases.
		expect( isRedirectOfferable( 'La', 'La', 'Lanthanum', true ) ).toBe( false );
	} );

	it( 'declines while the red-link title\'s existence is unknown', () => {
		expect( isRedirectOfferable( 'La', 'La', 'Lanthanum', null ) ).toBe( false );
		expect( isRedirectOfferable( 'La', 'La', 'Lanthanum' ) ).toBe( false );
	} );

	it( 'declines when the user searched for something else', () => {
		expect( isRedirectOfferable( 'NYC', 'Paris', 'Paris', false ) ).toBe( false );
	} );

	it( 'declines when the user did not arrive via a red link', () => {
		expect( isRedirectOfferable( null, 'NYC', 'New York City', false ) )
			.toBe( false );
	} );

	it( 'declines a self-redirect', () => {
		expect( isRedirectOfferable( 'NYC', 'NYC', 'NYC', false ) ).toBe( false );
		expect( isRedirectOfferable( 'nyc', 'nyc', 'Nyc', false ) ).toBe( false );
	} );

	it( 'declines when the target article title is unknown', () => {
		expect( isRedirectOfferable( 'NYC', 'NYC', '', false ) ).toBe( false );
	} );
} );
