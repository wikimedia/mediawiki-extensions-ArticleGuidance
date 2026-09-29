<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Language\Language;
use MediaWiki\Page\PageProps;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use MediaWikiIntegrationTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\OutlineService
 */
class OutlineServiceTest extends MediaWikiIntegrationTestCase {

	private function makeMember( int $pageId, string $titleText ): Title {
		$member = $this->createMock( Title::class );
		$member->method( 'getArticleID' )->willReturn( $pageId );
		$member->method( 'getPrefixedText' )->willReturn( $titleText );
		$member->method( 'getTouched' )->willReturn( '20260101000000' );
		return $member;
	}

	/**
	 * Build an OutlineService with injectable category members, bypassing the DB lookup.
	 *
	 * @param Title[] $members Category members
	 * @param array<int,string> $propsById articleguidance-data JSON blobs by page ID
	 */
	private function getService( array $members, array $propsById ): OutlineService {
		$pageProps = $this->createMock( PageProps::class );
		$pageProps->method( 'getProperties' )->willReturn( $propsById );

		$services = $this->getServiceContainer();
		return new class (
			$services->getTitleFactory(),
			$pageProps,
			$services->getContentLanguage(),
			$members
		) extends OutlineService {

			/** @var Title[] */
			private array $members;

			/**
			 * @param TitleFactory $titleFactory
			 * @param PageProps $pageProps
			 * @param Language $contentLanguage
			 * @param Title[] $members
			 */
			public function __construct(
				TitleFactory $titleFactory,
				PageProps $pageProps,
				Language $contentLanguage,
				array $members
			) {
				parent::__construct( $titleFactory, $pageProps, $contentLanguage );
				$this->members = $members;
			}

			/** @inheritDoc */
			protected function getCategoryMembers( Title $categoryTitle ): iterable {
				return $this->members;
			}
		};
	}

	/**
	 * @param string[] $qIds
	 * @return string articleguidance-data JSON blob
	 */
	private function makeBlob( array $qIds ): string {
		return json_encode( [
			'articleTypes' => array_map(
				static fn ( string $qId ) => [ 'id' => $qId, 'hierarchyDepth' => null, 'matchVia' => null ],
				$qIds
			),
		] );
	}

	public function testSynthesizesArticleTypesFromLegacyBlob(): void {
		// Blob persisted before multi-item support (T421260): singular fields only
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Company outline' ) ],
			[
				1 => json_encode( [
					'articleType' => 'Q4830453',
					'label' => 'Company',
					'hierarchyDepth' => 5,
				] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertCount( 1, $outlines );
		$this->assertSame(
			[ [ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ] ],
			$outlines[0]['articleTypes']
		);
	}

	public function testLabelFallsBackToPrimaryQId(): void {
		// Outline blob without a stored label: the (ucfirst'd) primary Q ID is used
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Company outline' ) ],
			[
				1 => json_encode( [
					'articleTypes' => [
						[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
					],
				] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertCount( 1, $outlines );
		$this->assertSame( 'Q4830453', $outlines[0]['label'] );
	}

	public function testPassesThroughStoredArticleTypes(): void {
		$articleTypes = [
			[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
			[ 'id' => 'Q783794', 'hierarchyDepth' => 7, 'matchVia' => null ],
		];
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Company outline' ) ],
			[
				1 => json_encode( [
					'articleTypes' => $articleTypes,
					'label' => 'Company',
				] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertCount( 1, $outlines );
		$this->assertSame( $articleTypes, $outlines[0]['articleTypes'] );
	}

	public function testGetOutlineByQIdMatchesAnyListedId(): void {
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Company outline' ),
				$this->makeMember( 2, 'Wikipedia:Person outline' ),
			],
			[
				1 => json_encode( [
					'articleTypes' => [
						[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
						[ 'id' => 'Q783794', 'hierarchyDepth' => 7, 'matchVia' => null ],
					],
					'label' => 'Company',
				] ),
				2 => json_encode( [
					'articleTypes' => [
						[ 'id' => 'Q5', 'hierarchyDepth' => 10, 'matchVia' => null ],
					],
					'label' => 'Person',
				] ),
			]
		);

		// Primary and secondary IDs both resolve to the multi-item outline
		$byPrimary = $service->getOutlineByQId( 'Q4830453' );
		$bySecondary = $service->getOutlineByQId( 'Q783794' );
		$this->assertNotNull( $byPrimary );
		$this->assertNotNull( $bySecondary );
		$this->assertSame( 'Wikipedia:Company outline', $byPrimary['title'] );
		$this->assertSame( 'Wikipedia:Company outline', $bySecondary['title'] );

		$person = $service->getOutlineByQId( 'Q5' );
		$this->assertNotNull( $person );
		$this->assertSame( 'Wikipedia:Person outline', $person['title'] );

		$this->assertNull( $service->getOutlineByQId( 'Q999999' ) );
	}

	public function testServesGenericOutlineWithNoArticleTypes(): void {
		// A generic outline has no Wikidata item (T435605), so its blob has
		// neither articleTypes nor the description and image that come with it
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:General outline' ) ],
			[
				1 => json_encode( [
					'articleTypes' => [],
					'label' => 'General guidance',
					'generic' => true,
					'instructions' => '<p>Write a lead.</p>',
				] ),
			]
		);

		$outlines = $service->getOutlines();
		$this->assertCount( 1, $outlines );
		$this->assertTrue( $outlines[0]['generic'] );
		$this->assertSame( [], $outlines[0]['articleTypes'] );
		$this->assertSame( 'General guidance', $outlines[0]['label'] );
		$this->assertSame( '<p>Write a lead.</p>', $outlines[0]['instructions'] );
	}

	public function testGenericOutlineIsDistinctFromRegularOnes(): void {
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Company outline' ),
				$this->makeMember( 2, 'Wikipedia:General outline' ),
			],
			[
				1 => json_encode( [
					'articleTypes' => [
						[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
					],
					'label' => 'Company',
				] ),
				2 => json_encode( [
					'articleTypes' => [],
					'label' => 'General guidance',
					'generic' => true,
				] ),
			]
		);

		$outlines = $service->getOutlines();
		// A regular outline is never mistaken for the generic one
		$this->assertFalse( $outlines[0]['generic'] );
		$this->assertTrue( $outlines[1]['generic'] );

		// The generic outline has no Q ID, so no Q ID lookup finds it
		$this->assertNull( $service->getOutlineByQId( OutlineService::GENERIC_ARTICLE_TYPE ) );

		// It is reachable by the dedicated lookup instead. SourceValidator uses
		// this when the client sends the sentinel as the outline Q ID.
		$generic = $service->getGenericOutline();
		$this->assertNotNull( $generic );
		$this->assertSame( 'Wikipedia:General outline', $generic['title'] );
	}

	public function testGetGenericOutlineReturnsNullWhenThereIsNone(): void {
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Company outline' ) ],
			[
				1 => json_encode( [
					'articleTypes' => [
						[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
					],
					'label' => 'Company',
				] ),
			]
		);

		$this->assertNull( $service->getGenericOutline() );
	}

	/**
	 * A generic outline can list source domains, and they survive the page
	 * property round trip like any other outline's (T435605). SourceValidator
	 * reads exactly these keys to classify a source.
	 */
	public function testGenericOutlineCarriesSourceLists(): void {
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:General outline' ) ],
			[
				1 => json_encode( [
					'articleTypes' => [],
					'label' => 'General guidance',
					'generic' => true,
					'recommendedSources' => [
						'info' => [ 'News organisations with editorial oversight' ],
						'urls' => [ 'reuters.com' ],
					],
					'discouragedSources' => [
						'info' => [ 'Self-published material' ],
						'urls' => [ 'facebook.com' ],
					],
				] ),
			]
		);

		$generic = $service->getGenericOutline();
		$this->assertNotNull( $generic );
		$this->assertSame( [ 'reuters.com' ], $generic['recommendedSources']['urls'] );
		$this->assertSame( [ 'facebook.com' ], $generic['discouragedSources']['urls'] );
	}

	public function testOldestGenericOutlineWins(): void {
		$genericBlob = json_encode( [ 'articleTypes' => [], 'label' => 'General guidance', 'generic' => true ] );
		// Members are in sort-key order, which is not creation order
		$service = $this->getService(
			[
				$this->makeMember( 5, 'Wikipedia:General outline' ),
				$this->makeMember( 2, 'Wikipedia:Generic' ),
				$this->makeMember( 9, 'Wikipedia:Other generic' ),
			],
			[ 5 => $genericBlob, 2 => $genericBlob, 9 => $genericBlob ]
		);

		$this->assertSame( [ 'Wikipedia:Generic' ], array_column( $service->getOutlines(), 'title' ) );
		$this->assertSame( 'Wikipedia:Generic', $service->getGenericOutline()['title'] );

		$duplicates = $service->getDuplicates( 5, [ OutlineService::GENERIC_ARTICLE_TYPE ] );
		$this->assertSame(
			'Wikipedia:Generic',
			$duplicates[OutlineService::GENERIC_ARTICLE_TYPE]['owner']->getPrefixedText()
		);
		$this->assertSame(
			[ 'Wikipedia:Other generic' ],
			array_map(
				static fn ( Title $title ) => $title->getPrefixedText(),
				$duplicates[OutlineService::GENERIC_ARTICLE_TYPE]['others']
			)
		);
	}

	public function testOldestOutlineOwnsSharedQIdWhateverTheMemberOrder(): void {
		// Members are in sort-key order, which is not creation order
		$service = $this->getService(
			[
				$this->makeMember( 7, 'Wikipedia:Citrus' ),
				$this->makeMember( 3, 'Wikipedia:Fruit' ),
			],
			[ 7 => $this->makeBlob( [ 'Q3314483' ] ), 3 => $this->makeBlob( [ 'Q3314483' ] ) ]
		);

		$outlines = $service->getOutlines();

		$this->assertSame( [ 'Wikipedia:Fruit' ], array_column( $outlines, 'title' ) );
		$this->assertSame( 'Wikipedia:Fruit', $service->getOutlineByQId( 'Q3314483' )['title'] );
	}

	public function testPartialOverlapKeepsOnlyOwnedQIds(): void {
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Company' ),
				$this->makeMember( 2, 'Wikipedia:Research group' ),
			],
			[
				1 => $this->makeBlob( [ 'Q1', 'Q2' ] ),
				2 => $this->makeBlob( [ 'Q2', 'Q3' ] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertSame( [ 'Q1', 'Q2' ], array_column( $outlines[0]['articleTypes'], 'id' ) );
		$this->assertSame( [ 'Q3' ], array_column( $outlines[1]['articleTypes'], 'id' ) );
		$this->assertSame( 'Wikipedia:Company', $service->getOutlineByQId( 'Q2' )['title'] );
	}

	public function testGetDuplicatesForOwner(): void {
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Person' ),
				$this->makeMember( 2, 'Wikipedia:People' ),
				$this->makeMember( 3, 'Wikipedia:Human' ),
				$this->makeMember( 4, 'Wikipedia:Company' ),
			],
			[
				1 => $this->makeBlob( [ 'Q5' ] ),
				2 => $this->makeBlob( [ 'Q5' ] ),
				3 => $this->makeBlob( [ 'Q5' ] ),
				4 => $this->makeBlob( [ 'Q4830453' ] ),
			]
		);

		$duplicates = $service->getDuplicates( 1, [ 'Q5' ] );

		$this->assertSame( [ 'Q5' ], array_keys( $duplicates ) );
		$this->assertNull( $duplicates['Q5']['owner'] );
		$this->assertSame(
			[ 'Wikipedia:People', 'Wikipedia:Human' ],
			array_map( static fn ( Title $title ) => $title->getPrefixedText(), $duplicates['Q5']['others'] )
		);
		$this->assertSame( [], $service->getDuplicates( 4, [ 'Q4830453' ] ) );
	}

	public function testGetDuplicatesForShadowedOutline(): void {
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Person' ),
				$this->makeMember( 2, 'Wikipedia:People' ),
				$this->makeMember( 3, 'Wikipedia:Human' ),
			],
			[
				1 => $this->makeBlob( [ 'Q5' ] ),
				2 => $this->makeBlob( [ 'Q5' ] ),
				3 => $this->makeBlob( [ 'Q5', 'Q215627' ] ),
			]
		);

		$duplicates = $service->getDuplicates( 3, [ 'Q5', 'Q215627' ] );

		$this->assertSame( [ 'Q5' ], array_keys( $duplicates ) );
		$this->assertSame( 'Wikipedia:Person', $duplicates['Q5']['owner']->getPrefixedText() );
		$this->assertSame(
			[ 'Wikipedia:People' ],
			array_map( static fn ( Title $title ) => $title->getPrefixedText(), $duplicates['Q5']['others'] )
		);
	}

	public function testGetDuplicatesUsesTheGivenQIdsForTheViewedPage(): void {
		// Page 9 is new: it is not a category member yet, and its stored
		// QIDs are not in page_props yet
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Person' ),
				$this->makeMember( 12, 'Wikipedia:Human' ),
			],
			[
				1 => $this->makeBlob( [ 'Q5' ] ),
				12 => $this->makeBlob( [ 'Q215627' ] ),
			]
		);

		$duplicates = $service->getDuplicates( 9, [ 'Q5', 'Q215627' ] );

		$this->assertSame( 'Wikipedia:Person', $duplicates['Q5']['owner']->getPrefixedText() );
		$this->assertNull( $duplicates['Q215627']['owner'] );
		$this->assertSame(
			[ 'Wikipedia:Human' ],
			array_map( static fn ( Title $title ) => $title->getPrefixedText(), $duplicates['Q215627']['others'] )
		);
	}

	public function testDescriptionAndImageComeFromFirstOwnedItem(): void {
		$entry = static fn ( string $qId ) => [
			'id' => $qId,
			'hierarchyDepth' => null,
			'matchVia' => null,
			'itemLabel' => "label $qId",
			'itemDescription' => "Description $qId",
			'itemImage' => "https://example.org/$qId.jpg",
		];
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Business' ),
				$this->makeMember( 2, 'Wikipedia:Research group' ),
			],
			[
				1 => json_encode( [
					'articleTypes' => [ $entry( 'Q2' ) ],
					'description' => 'Description Q2',
					'image' => 'https://example.org/Q2.jpg',
				] ),
				2 => json_encode( [
					'articleTypes' => [ $entry( 'Q2' ), $entry( 'Q3' ) ],
					'description' => 'Description Q2',
					'image' => 'https://example.org/Q2.jpg',
				] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertSame( 'Description Q2', $outlines[0]['description'] );
		$this->assertSame( 'Description Q3', $outlines[1]['description'] );
		$this->assertSame( 'https://example.org/Q3.jpg', $outlines[1]['thumbnail'] );
		// The item fields are for the page notice, not for the client
		$this->assertSame(
			[ [ 'id' => 'Q3', 'hierarchyDepth' => null, 'matchVia' => null ] ],
			$outlines[1]['articleTypes']
		);
	}

	public function testOlderBlobDropsDescriptionAndImageOfShadowedPrimaryItem(): void {
		// Blobs saved before the item fields: only the primary item's description and image
		$makeBlob = static fn ( array $qIds ) => json_encode( [
			'articleType' => $qIds[0],
			'articleTypes' => array_map(
				static fn ( string $qId ) => [ 'id' => $qId, 'hierarchyDepth' => null, 'matchVia' => null ],
				$qIds
			),
			'description' => "Description $qIds[0]",
			'image' => "https://example.org/$qIds[0].jpg",
		] );
		$service = $this->getService(
			[
				$this->makeMember( 1, 'Wikipedia:Business' ),
				$this->makeMember( 2, 'Wikipedia:Research group' ),
			],
			[ 1 => $makeBlob( [ 'Q2' ] ), 2 => $makeBlob( [ 'Q2', 'Q3' ] ) ]
		);

		$outlines = $service->getOutlines();

		$this->assertSame( 'Description Q2', $outlines[0]['description'] );
		$this->assertSame( 'https://example.org/Q2.jpg', $outlines[0]['thumbnail'] );
		$this->assertSame( '', $outlines[1]['description'] );
		$this->assertNull( $outlines[1]['thumbnail'] );
	}
}
