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

	public function testReExposesPrimaryTypeAsLegacySingularFields(): void {
		// Pre-multi-item JS bundles cached across a deploy read the singular
		// fields, so the primary entry is served under them as well
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Tennis player outline' ) ],
			[
				1 => json_encode( [
					'articleType' => 'Q10833314',
					'articleTypes' => [
						[ 'id' => 'Q10833314', 'hierarchyDepth' => 4, 'matchVia' => 'P106' ],
						[ 'id' => 'Q13381863', 'hierarchyDepth' => 6, 'matchVia' => 'P106' ],
					],
					'label' => 'Tennis player',
				] ),
			]
		);

		$outlines = $service->getOutlines();

		$this->assertSame( 'Q10833314', $outlines[0]['articleType'] );
		$this->assertSame( 4, $outlines[0]['hierarchyDepth'] );
		$this->assertSame( 'P106', $outlines[0]['matchVia'] );
	}

	public function testLabelFallsBackToPrimaryQId(): void {
		// Legacy blob without a stored label: the (ucfirst'd) primary Q ID is used
		$service = $this->getService(
			[ $this->makeMember( 1, 'Wikipedia:Company outline' ) ],
			[
				1 => json_encode( [
					'articleType' => 'Q4830453',
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
					'articleType' => 'Q4830453',
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
					'articleType' => 'Q4830453',
					'articleTypes' => [
						[ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ],
						[ 'id' => 'Q783794', 'hierarchyDepth' => 7, 'matchVia' => null ],
					],
					'label' => 'Company',
				] ),
				2 => json_encode( [
					'articleType' => 'Q5',
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

		// Legacy single-item outline still resolves via its synthesized list
		$legacy = $service->getOutlineByQId( 'Q5' );
		$this->assertNotNull( $legacy );
		$this->assertSame( 'Wikipedia:Person outline', $legacy['title'] );

		$this->assertNull( $service->getOutlineByQId( 'Q999999' ) );
	}
}
