'use strict';

const {
	isValidUrl, isDuplicate, isReferenceCode, getCitationIdentifiers, hasDuplicateIdentifier
} = require( '../../../resources/ext.articleguidance.newarticle/utils/sources.js' );

// The URL parser reads a code of digits as an IPv4 address, so a check for
// a dot in the hostname is not sufficient.
const referenceCodes = {
	DOI: '10.1038/nature14539',
	'DOI with a short suffix': '10.1000/182',
	'DOI with a prefix': 'doi:10.1038/nature14539',
	PMID: '26017442',
	'PMID with a prefix': 'PMID 26017442',
	'OCLC number': '1234567',
	'ISBN-10 of digits': '1400079985',
	'ISBN-10 that starts with 0': '0226779998',
	'ISBN-10 that ends with X': '080442957X',
	'ISBN-10 with hyphens': '0-226-77999-8',
	'ISBN-13 of digits': '9780226458083',
	'ISBN-13 with hyphens': '978-0-226-45808-3',
	'ISBN-13 with spaces': '978 0 226 45808 3',
	PMCID: 'PMC4532812',
	'Wikidata QID': 'Q42'
};

const otherInput = {
	'word without a top-level domain': 'notaurl',
	'empty string': '',
	'free text': 'climate change effects on coral reefs',
	'IP address URL': 'https://192.168.1.1/page',
	'IP address without a scheme': '192.168.1.1',
	'localhost URL': 'http://localhost:8080/wiki',
	'scheme other than http or https': 'ftp://example.com',
	'numeric top-level domain': 'example.123',
	// Citoid reads it as a PMID
	'arXiv ID': '2101.00001'
};

describe( 'isValidUrl', () => {
	const links = {
		'https URL with a path': 'https://example.com/article',
		'http URL': 'http://example.com',
		'URL in upper case': 'HTTPS://Example.COM/Page',
		'domain without a scheme': 'en.wikipedia.org',
		'URL without a scheme, with a path': 'www.bbc.co.uk/news/science-environment-56837908',
		'URL with a query and a fragment': 'https://example.com/search?q=a&lang=en#top',
		'doi.org URL': 'https://doi.org/10.1038/nature14539',
		'PubMed URL': 'https://pubmed.ncbi.nlm.nih.gov/26017442',
		'Latin IDN domain': 'https://bücher.example',
		'Greek IDN domain without a scheme': 'ουτοπία.δπθ.gr',
		'Bengali IDN domain without a scheme': 'উইকিপিডিয়া.বাংলা',
		'punycode top-level domain': 'https://example.xn--p1ai'
	};

	test.each( Object.entries( links ) )( 'accepts a link: %s', ( label, input ) => {
		expect( isValidUrl( input ) ).toBe( true );
	} );

	test.each( Object.entries( referenceCodes ) )( 'rejects a reference code: %s', ( label, input ) => {
		expect( isValidUrl( input ) ).toBe( false );
	} );

	test.each( Object.entries( otherInput ) )( 'rejects other input: %s', ( label, input ) => {
		expect( isValidUrl( input ) ).toBe( false );
	} );
} );

describe( 'isReferenceCode', () => {
	test.each( Object.entries( referenceCodes ) )( 'accepts a reference code: %s', ( label, input ) => {
		expect( isReferenceCode( input ) ).toBe( true );
	} );

	test.each( Object.entries( otherInput ) )( 'rejects other input: %s', ( label, input ) => {
		expect( isReferenceCode( input ) ).toBe( false );
	} );

	it( 'rejects a number that is too long for a PMID and is not an ISBN', () => {
		expect( isReferenceCode( '12345678901' ) ).toBe( false );
	} );
} );

describe( 'isDuplicate', () => {
	it( 'returns true when URL already exists in sources', () => {
		const sources = [ { url: 'https://example.com' } ];
		expect( isDuplicate( 'https://example.com', sources ) ).toBe( true );
	} );

	it( 'returns false when URL is not in sources', () => {
		const sources = [ { url: 'https://other.com' } ];
		expect( isDuplicate( 'https://example.com', sources ) ).toBe( false );
	} );

	it( 'treats URLs as duplicates regardless of scheme prefix', () => {
		const sources = [ { url: 'https://example.com' } ];
		expect( isDuplicate( 'example.com', sources ) ).toBe( true );
	} );
} );

describe( 'getCitationIdentifiers', () => {
	it( 'returns the DOI in lower case', () => {
		expect( getCitationIdentifiers( { itemType: 'journalArticle', DOI: '10.1038/Nature14539' } ) )
			.toEqual( [ 'doi:10.1038/nature14539' ] );
	} );

	it( 'returns the ISBNs of a book as ISBN-13 without hyphens', () => {
		const citation = { itemType: 'book', ISBN: [ '0-226-45808-3', '978-0-226-45807-6' ] };
		expect( getCitationIdentifiers( citation ) )
			.toEqual( [ 'isbn:9780226458083', 'isbn:9780226458076' ] );
	} );

	it( 'reads ISBNs separated by spaces', () => {
		const citation = { itemType: 'book', ISBN: '080442957X 9780226458083' };
		expect( getCitationIdentifiers( citation ) )
			.toEqual( [ 'isbn:9780804429573', 'isbn:9780226458083' ] );
	} );

	it( 'returns only the DOI of a book section, which shares the ISBN of its book', () => {
		const citation = { itemType: 'bookSection', DOI: '10.1385/0-89603-627-8:33', ISBN: [ '0-89603-627-8' ] };
		expect( getCitationIdentifiers( citation ) ).toEqual( [ 'doi:10.1385/0-89603-627-8:33' ] );
	} );

	it( 'returns the PMID, the PMCID without its prefix and the QID', () => {
		expect( getCitationIdentifiers( { itemType: 'journalArticle', PMID: '26295053', PMCID: 'PMC4532812' } ) )
			.toEqual( [ 'pmid:26295053', 'pmcid:4532812' ] );
		expect( getCitationIdentifiers( { itemType: 'webpage', qid: 'q42' } ) ).toEqual( [ 'qid:Q42' ] );
	} );

	it( 'returns no identifiers for a web page without one', () => {
		expect( getCitationIdentifiers( { itemType: 'webpage', url: 'https://a.com' } ) ).toEqual( [] );
	} );
} );

describe( 'hasDuplicateIdentifier', () => {
	const sources = [
		{ url: '26017442', identifiers: [ 'pmid:26017442', 'doi:10.1038/nature14539' ] },
		{ url: 'https://a.com', identifiers: [] }
	];

	it( 'returns true when an added source has one of the identifiers', () => {
		expect( hasDuplicateIdentifier( [ 'doi:10.1038/nature14539' ], sources ) ).toBe( true );
	} );

	it( 'returns false when no added source has one of the identifiers', () => {
		expect( hasDuplicateIdentifier( [ 'doi:10.1000/182' ], sources ) ).toBe( false );
		expect( hasDuplicateIdentifier( [], sources ) ).toBe( false );
	} );
} );
