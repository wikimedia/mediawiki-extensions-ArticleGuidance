'use strict';

// config.json is a virtual ResourceLoader module (not on disk), so provide it here.
jest.mock(
	'../../../resources/ext.articleguidance.outlinebuilder/config.json',
	() => ( { ArticleGuidanceOutlineBuilderSourceApi: '' } ),
	{ virtual: true }
);

const {
	extractLeadSentence,
	templatizeSentence,
	aggregateLeadPattern,
	contentHeadingKeys,
	extractReferenceDomains
} = require( '../../../resources/ext.articleguidance.outlinebuilder/outlineGenerator.js' );

describe( 'extractLeadSentence', () => {
	it( 'takes the opening sentence, past the infobox and the references', () => {
		const wikitext = [
			'{{Infobox museum',
			'| name = The Louvre',
			'| location = Paris',
			'}}',
			"The '''Louvre''' is an art museum in [[Paris]], France.<ref>Cited.</ref>",
			'It opened in 1793.',
			'',
			'== History =='
		].join( '\n' );
		expect( extractLeadSentence( wikitext ) )
			.toBe( "The '''Louvre''' is an art museum in Paris, France." );
	} );

	it( 'does not cut at an abbreviation or an initial', () => {
		const wikitext = "'''St. Louis Art Museum''' is a museum in St. Louis, Missouri. " +
			'It was founded in 1879.';
		expect( extractLeadSentence( wikitext ) )
			.toBe( "'''St. Louis Art Museum''' is a museum in St. Louis, Missouri." );
	} );

	it( 'drops file links but keeps a title that merely contains a colon', () => {
		const wikitext = '[[File:Poster.jpg|thumb|A poster]]\n' +
			"'''[[Star Trek: The Motion Picture]]''' is a 1979 film directed by Robert Wise.";
		expect( extractLeadSentence( wikitext ) )
			.toBe( "'''Star Trek: The Motion Picture''' is a 1979 film directed by Robert Wise." );
	} );

	it( 'gives up on a lead with no usable sentence break', () => {
		expect( extractLeadSentence( 'Short' ) ).toBe( '' );
	} );
} );

describe( 'templatizeSentence', () => {
	it( 'replaces the subject and its infobox values with named slots', () => {
		const result = templatizeSentence(
			"The '''Louvre''' is an art museum located in Paris, France.",
			{ type: 'art museum', city: 'Paris', country: 'France' }
		);
		expect( result.text ).toBe( 'The [name] is an [type] located in [city], [country].' );
		expect( result.slots ).toEqual( [ 'name', 'type', 'city', 'country' ] );
	} );

	it( 'prefers the longest value, so a contained one cannot claim it first', () => {
		const result = templatizeSentence(
			"'''Prado''' is a museum in Madrid, Spain.",
			{ country: 'Spain', place: 'Madrid, Spain' }
		);
		expect( result.text ).toBe( '[name] is a museum in [place].' );
	} );

	it( 'reads values through links and templates', () => {
		const result = templatizeSentence(
			"'''Tate Modern''' is a modern art gallery in London.",
			{ city: '[[London]]{{sfn|Smith|2001}}' }
		);
		expect( result.text ).toBe( '[name] is a modern art gallery in [city].' );
	} );

	it( 'ignores image fields and values too short to match safely', () => {
		const result = templatizeSentence(
			"'''Uffizi''' is an art museum in Italy.",
			{ image: 'Uffizi art museum.jpg', code: 'IT' }
		);
		expect( result.text ).toBe( '[name] is an art museum in Italy.' );
		expect( result.slots ).toEqual( [ 'name' ] );
	} );

	it( 'returns the sentence unchanged when nothing matches', () => {
		const result = templatizeSentence( 'A museum of no particular kind.', {} );
		expect( result.text ).toBe( 'A museum of no particular kind.' );
		expect( result.slots ).toEqual( [] );
	} );
} );

describe( 'aggregateLeadPattern', () => {
	const withSlots = ( text, slots, title ) => ( { text: text, slots: slots, title: title } );

	it( 'picks the shared slot sequence and the shortest wording that uses it', () => {
		const pattern = aggregateLeadPattern( [
			withSlots( 'The [name] is a large [type] in [city].', [ 'name', 'type', 'city' ], 'A' ),
			withSlots( '[name] is a [type] in [city].', [ 'name', 'type', 'city' ], 'B' ),
			withSlots( '[name] was founded in [year].', [ 'name', 'year' ], 'C' )
		], 3 );
		expect( pattern.text ).toBe( '[name] is a [type] in [city].' );
		expect( pattern.source ).toBe( 'B' );
		expect( pattern.support ).toBe( 2 );
		expect( pattern.total ).toBe( 3 );
	} );

	it( 'returns null when no sequence is shared', () => {
		expect( aggregateLeadPattern( [
			withSlots( '[name] is a [type].', [ 'name', 'type' ], 'A' ),
			withSlots( '[name] opened in [year].', [ 'name', 'year' ], 'B' )
		], 2 ) ).toBeNull();
	} );

	it( 'ignores sentences that slot only the subject', () => {
		expect( aggregateLeadPattern( [
			withSlots( '[name] is a museum.', [ 'name' ], 'A' ),
			withSlots( '[name] is a gallery.', [ 'name' ], 'B' )
		], 2 ) ).toBeNull();
	} );

	it( 'omits a pattern fewer than 30% of the articles write', () => {
		const leads = [
			withSlots( '[name] is a [type] in [city].', [ 'name', 'type', 'city' ], 'A' ),
			withSlots( 'The [name] is a [type] in [city].', [ 'name', 'type', 'city' ], 'B' ),
			withSlots( '[name] was founded in [year].', [ 'name', 'year' ], 'C' )
		];
		expect( aggregateLeadPattern( leads, 3 ).support ).toBe( 2 );
		// The same two articles, out of ten read: too few to call it the type's.
		expect( aggregateLeadPattern( leads, 10 ) ).toBeNull();
	} );
} );

describe( 'contentHeadingKeys', () => {
	it( 'keeps content sections and drops the appendices', () => {
		const sections = [
			{ heading: 'History', body: 'Founded in 1793.<ref>Book.</ref>' },
			{ heading: 'Collection', body: 'Holds paintings.' },
			{ heading: 'See also', body: '* [[Louvre-Lens]]\n* [[Tuileries]]' },
			{ heading: 'References', body: '{{Reflist}}' }
		];
		expect( contentHeadingKeys( sections ) ).toEqual( [ 'history', 'collection' ] );
	} );

	it( 'de-duplicates a heading that appears twice', () => {
		expect( contentHeadingKeys( [
			{ heading: 'History', body: 'One.' },
			{ heading: 'history:', body: 'Two.' }
		] ) ).toEqual( [ 'history' ] );
	} );
} );

describe( 'extractReferenceDomains', () => {
	it( 'reads the URLs in the references only', () => {
		const wikitext = 'Text.<ref>{{cite web |url=https://www.bbc.co.uk/news/1 }}</ref>\n' +
			'More.<ref name="a">[https://Example.com/page Title]</ref><ref name="a" />\n' +
			'{{Infobox |website=https://subject.org }}\n' +
			'<!-- <ref>https://hidden.net</ref> -->\n' +
			'== External links ==\n* [https://other.com Other]\n<references />';
		expect( extractReferenceDomains( wikitext ) ).toEqual( [ 'bbc.co.uk', 'example.com' ] );
	} );

	it( 'skips archives, identifiers, Google Books and Wikimedia sites', () => {
		const wikitext = '<ref>{{cite web |url=https://news.com/a ' +
			'|archive-url=https://web.archive.org/web/1/https://news.com/a }}</ref>' +
			'<ref>https://doi.org/10.1/x https://books.google.co.uk/books?id=1</ref>' +
			'<ref>https://en.wikipedia.org/wiki/X https://hdl.handle.net/1/2</ref>';
		expect( extractReferenceDomains( wikitext ) ).toEqual( [ 'news.com' ] );
	} );
} );
