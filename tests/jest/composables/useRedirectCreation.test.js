'use strict';

const { ref, computed } = require( 'vue' );

// jest.mock calls are hoisted, so these paths have to be literals.
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js',
	() => ( { checkPagesExist: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/api/Redirect.js',
	() => ( { createRedirect: jest.fn() } )
);
jest.mock(
	'../../../resources/ext.articleguidance.newarticle/logging/instrument.js',
	() => ( { logRedirectCreated: jest.fn() } )
);

const { checkPagesExist } = require(
	'../../../resources/ext.articleguidance.newarticle/api/MediaWiki.js'
);
const { createRedirect: createRedirectPage } = require(
	'../../../resources/ext.articleguidance.newarticle/api/Redirect.js'
);
const instrument = require(
	'../../../resources/ext.articleguidance.newarticle/logging/instrument.js'
);
const useRedirectCreation = require(
	'../../../resources/ext.articleguidance.newarticle/composables/useRedirectCreation.js'
);

/**
 * Stub mw.Title with the rules of a wiki that capitalises the first letter, as
 * isSamePage() delegates page identity to it.
 */
function mockMwTitle() {
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
 * Instantiate the composable with the red-link flow's usual inputs.
 *
 * @param {Object} over Overrides for redLinkTitle, searchQuery or targetTitle
 * @return {Object}
 */
function setup( over = {} ) {
	const redLinkTitle = ref( over.redLinkTitle !== undefined ? over.redLinkTitle : 'NYC' );
	const searchQuery = ref( over.searchQuery !== undefined ? over.searchQuery : 'NYC' );
	const target = ref( over.targetTitle !== undefined ? over.targetTitle : 'New York City' );
	return Object.assign(
		useRedirectCreation( {
			redLinkTitle,
			searchQuery,
			targetTitle: computed( () => target.value )
		} ),
		{ redLinkTitle, searchQuery, target }
	);
}

describe( 'useRedirectCreation', () => {
	beforeEach( () => {
		jest.clearAllMocks();
		mockMwTitle();
		checkPagesExist.mockResolvedValue( { NYC: false } );
		createRedirectPage.mockResolvedValue( {} );
	} );

	it( 'withholds the option until the red link is known to be free', async () => {
		const r = setup();

		// Nothing checked yet: existence is unknown, so no offer.
		expect( r.canCreateRedirect.value ).toBe( false );

		await r.checkRedLink();

		expect( checkPagesExist ).toHaveBeenCalledWith( [ 'NYC' ] );
		expect( r.canCreateRedirect.value ).toBe( true );
	} );

	it( 'withholds the option once the red link has been created', async () => {
		checkPagesExist.mockResolvedValue( { NYC: true } );
		const r = setup();

		await r.checkRedLink();

		expect( r.canCreateRedirect.value ).toBe( false );
	} );

	it( 'withholds the option when the existence check fails', async () => {
		checkPagesExist.mockRejectedValue( new Error( 'network' ) );
		const r = setup();

		await r.checkRedLink();

		expect( r.canCreateRedirect.value ).toBe( false );
	} );

	it( 'does not check anything when the user did not follow a red link', async () => {
		const r = setup( { redLinkTitle: null } );

		await r.checkRedLink();

		expect( checkPagesExist ).not.toHaveBeenCalled();
		expect( r.canCreateRedirect.value ).toBe( false );
	} );

	it( 'reports success and reaches the created state', async () => {
		const r = setup();
		await r.checkRedLink();

		await r.createRedirect();

		expect( createRedirectPage ).toHaveBeenCalledWith( 'NYC', 'New York City' );
		expect( r.redirectState.value ).toBe( 'created' );
		expect( instrument.logRedirectCreated ).toHaveBeenCalledWith( true );
	} );

	it( 'dismissing a success is terminal', async () => {
		const r = setup();
		await r.checkRedLink();
		await r.createRedirect();

		r.dismissRedirectMessage();

		expect( r.redirectState.value ).toBe( 'done' );
	} );

	it( 'keeps the error and allows a retry for a transient failure', async () => {
		createRedirectPage.mockRejectedValue( 'ratelimited' );
		const r = setup();
		await r.checkRedLink();

		await r.createRedirect();

		expect( r.redirectState.value ).toBe( 'error' );
		expect( r.redirectErrorCode.value ).toBe( 'ratelimited' );
		expect( instrument.logRedirectCreated ).toHaveBeenCalledWith( false, 'ratelimited' );
		// The title is still free, so the action stays available.
		expect( r.canCreateRedirect.value ).toBe( true );
		r.dismissRedirectMessage();
		expect( r.redirectState.value ).toBe( 'idle' );
	} );

	it( 'withdraws the action when the title was taken mid-attempt', async () => {
		createRedirectPage.mockRejectedValue( 'articleexists' );
		const r = setup();
		await r.checkRedLink();

		await r.createRedirect();

		expect( r.redirectErrorCode.value ).toBe( 'articleexists' );
		// Retrying could only fail again, so neither retry nor button returns.
		expect( r.canCreateRedirect.value ).toBe( false );
		r.dismissRedirectMessage();
		expect( r.redirectState.value ).toBe( 'idle' );
	} );

	it( 'labels a rejection with no code', async () => {
		createRedirectPage.mockRejectedValue( undefined );
		const r = setup();
		await r.checkRedLink();

		await r.createRedirect();

		expect( r.redirectErrorCode.value ).toBe( 'unknown' );
	} );

	it( 'does not write when the option does not apply', async () => {
		// Never checked, so existence is unknown.
		const r = setup();

		await r.createRedirect();

		expect( createRedirectPage ).not.toHaveBeenCalled();
		expect( r.redirectState.value ).toBe( 'idle' );
	} );

	it( 'withholds the option when the query no longer matches the red link', async () => {
		const r = setup( { searchQuery: 'Paris', targetTitle: 'Paris' } );

		await r.checkRedLink();

		expect( r.canCreateRedirect.value ).toBe( false );
	} );
} );
