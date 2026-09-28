'use strict';

const { getCommonsThumbUrl } = require( '../../../resources/ext.articleguidance.newarticle/utils/commonsThumb.js' );

describe( 'getCommonsThumbUrl', () => {
	it( 'builds a thumbnail URL for a raster image', () => {
		expect( getCommonsThumbUrl( 'Example photo.jpg' ) ).toMatch(
			/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/Example_photo\.jpg\/60px-Example_photo\.jpg$/
		);
	} );

	it( 'adds a .png suffix for an SVG image', () => {
		expect( getCommonsThumbUrl( 'Lawrencium.svg' ) ).toBe(
			'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Lawrencium.svg/60px-Lawrencium.svg.png'
		);
	} );

	it( 'matches the SVG extension case-insensitively', () => {
		expect( getCommonsThumbUrl( 'Example.SVG' ) ).toMatch( /\/60px-Example\.SVG\.png$/ );
	} );
} );
