'use strict';

const modulePath = '../../../resources/ext.articleguidance.outlinebuilder/api/Outlines.js';

let restPost;

beforeEach( () => {
	restPost = jest.fn().mockResolvedValue( { qid: 'Q33999' } );

	global.mw = {
		Rest: jest.fn().mockImplementation( () => ( {
			post: restPost
		} ) ),
		user: {
			tokens: { get: jest.fn().mockReturnValue( 'csrf+\\' ) }
		}
	};
	jest.resetModules();
} );

describe( 'saveDraft', () => {
	it( 'posts the draft with the CSRF token', async () => {
		const { saveDraft } = require( modulePath );
		await saveDraft( [ 'Q33999' ], 'Outline text' );
		expect( restPost ).toHaveBeenCalledWith(
			'/articleguidance/v1/outline-draft/Q33999',
			{ text: 'Outline text', token: 'csrf+\\' }
		);
	} );

	it( 'posts all the article types, in order', async () => {
		const { saveDraft } = require( modulePath );
		await saveDraft( [ 'Q33999', 'Q5' ], 'Outline text' );
		expect( restPost ).toHaveBeenCalledWith(
			'/articleguidance/v1/outline-draft/Q33999%2CQ5',
			{ text: 'Outline text', token: 'csrf+\\' }
		);
	} );

	it( 'rejects when the request fails', async () => {
		restPost.mockRejectedValue( new Error( 'http' ) );
		const { saveDraft } = require( modulePath );
		await expect( saveDraft( [ 'Q33999' ], 'Outline text' ) ).rejects.toThrow( 'http' );
	} );
} );
