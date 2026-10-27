'use strict';

const { openLinksInNewTab } = require( '../../../resources/ext.articleguidance.newarticle/utils/links.js' );

describe( 'openLinksInNewTab', () => {
	it( 'opens an external link in a new tab', () => {
		expect( openLinksInNewTab( '<a class="external" href="https://a.com">A</a>' ) )
			.toBe( '<a class="external" href="https://a.com" target="_blank" rel="noopener noreferrer">A</a>' );
	} );

	it( 'opens an internal link in a new tab', () => {
		expect( openLinksInNewTab( '<a href="/wiki/Special:BookSources/123">123</a>' ) )
			.toBe( '<a href="/wiki/Special:BookSources/123" target="_blank" rel="noopener noreferrer">123</a>' );
	} );

	it( 'changes all the links in nested HTML', () => {
		const html = '<div><cite><a href="https://a.com">A</a> and <a href="https://b.com">B</a></cite></div>';
		expect( openLinksInNewTab( html ) ).toBe(
			'<div><cite>' +
			'<a href="https://a.com" target="_blank" rel="noopener noreferrer">A</a> and ' +
			'<a href="https://b.com" target="_blank" rel="noopener noreferrer">B</a>' +
			'</cite></div>'
		);
	} );

	it( 'replaces an existing target and rel', () => {
		expect( openLinksInNewTab( '<a href="https://a.com" target="_self" rel="nofollow">A</a>' ) )
			.toBe( '<a href="https://a.com" target="_blank" rel="noopener noreferrer">A</a>' );
	} );

	it( 'keeps fragment links and anchors without href', () => {
		const html = '<a href="#cite-note-1">1</a><a name="x">X</a>';
		expect( openLinksInNewTab( html ) ).toBe( html );
	} );

	it( 'keeps HTML without links', () => {
		const html = '<div class="mw-parser-output"><p>A</p></div>';
		expect( openLinksInNewTab( html ) ).toBe( html );
	} );
} );
