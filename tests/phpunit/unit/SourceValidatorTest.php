<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\SourceValidator;
use MediaWiki\Extension\ArticleGuidance\Services\UrlAsciiEncoder;
use MediaWiki\User\UserFactory;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\SourceValidator
 */
class SourceValidatorTest extends MediaWikiUnitTestCase {

	private const GENERIC_OUTLINE = [
		'title' => 'Wikipedia:Article guidance/General guidance',
		'label' => 'General guidance',
		'generic' => true,
		'articleTypes' => [],
		'recommendedSources' => [
			'info' => [ 'News organisations with editorial oversight' ],
			'urls' => [ 'reuters.com' ],
		],
		'discouragedSources' => [
			'info' => [ 'Self-published material' ],
			'urls' => [ 'facebook.com' ],
		],
	];

	private const COMPANY_OUTLINE = [
		'title' => 'Wikipedia:Article guidance/Company',
		'label' => 'Company',
		'generic' => false,
		'articleTypes' => [ [ 'id' => 'Q4830453', 'hierarchyDepth' => 5, 'matchVia' => null ] ],
		'recommendedSources' => [ 'info' => [], 'urls' => [ 'ft.com' ] ],
		'discouragedSources' => [ 'info' => [], 'urls' => [ 'prnewswire.com' ] ],
	];

	/**
	 * Build a validator over a wiki that has the given outlines.
	 *
	 * @param array $genericOutline What getGenericOutline() returns
	 * @param array|null $qIdOutline What getOutlineByQId() returns
	 * @return SourceValidator
	 */
	private function getValidator(
		array $genericOutline,
		?array $qIdOutline = null
	): SourceValidator {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getGenericOutline' )->willReturn( $genericOutline );
		$outlineService->method( 'getOutlineByQId' )->willReturn( $qIdOutline );

		$encoder = $this->createMock( UrlAsciiEncoder::class );
		$encoder->method( 'encode' )->willReturnArgument( 0 );

		return new SourceValidator(
			null,
			$this->createMock( UserFactory::class ),
			$outlineService,
			$encoder
		);
	}

	/**
	 * A wiki can list source domains on its generic guidance outline, and those
	 * lists classify sources for every subject that no other outline matches
	 * (T435605). The generic outline has no Q ID, so the client addresses it by
	 * the GENERIC_ARTICLE_TYPE sentinel instead.
	 */
	public function testGenericOutlineSourceListsApply(): void {
		$validator = $this->getValidator( self::GENERIC_OUTLINE );

		$recommended = $validator->validate(
			'https://reuters.com/world/article',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'recommended', $recommended['classification'] );

		$discouraged = $validator->validate(
			'https://facebook.com/some-page',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'discouraged', $discouraged['classification'] );

		$neutral = $validator->validate(
			'https://example.org/page',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'neutral', $neutral['classification'] );
	}

	/**
	 * Subdomains of a listed domain are covered, as they are for a regular
	 * outline.
	 */
	public function testGenericOutlineSourceListsCoverSubdomains(): void {
		$validator = $this->getValidator( self::GENERIC_OUTLINE );

		$result = $validator->validate(
			'https://uk.reuters.com/business',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'recommended', $result['classification'] );
	}

	/**
	 * The sentinel is not a Q ID, so it must never reach the Q ID lookup.
	 */
	public function testSentinelDoesNotUseTheQIdLookup(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getGenericOutline' )->willReturn( self::GENERIC_OUTLINE );
		$outlineService->expects( $this->never() )->method( 'getOutlineByQId' );

		$encoder = $this->createMock( UrlAsciiEncoder::class );
		$encoder->method( 'encode' )->willReturnArgument( 0 );

		$validator = new SourceValidator(
			null,
			$this->createMock( UserFactory::class ),
			$outlineService,
			$encoder
		);

		$result = $validator->validate(
			'https://reuters.com/world',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'recommended', $result['classification'] );
	}

	/**
	 * A wiki with no generic outline gets the default one (T437432). It has
	 * no domain lists, so the sentinel classifies no source.
	 */
	public function testSentinelIsNeutralForTheDefaultGenericOutline(): void {
		$validator = $this->getValidator( [
			'title' => OutlineService::DEFAULT_GENERIC_OUTLINE_TITLE,
			'generic' => true,
			'default' => true,
			'articleTypes' => [],
			'recommendedSources' => [ 'info' => [ 'News organisations' ], 'urls' => [] ],
			'discouragedSources' => [ 'info' => [ 'Blogs' ], 'urls' => [] ],
		] );

		$result = $validator->validate(
			'https://reuters.com/world',
			OutlineService::GENERIC_ARTICLE_TYPE
		);
		$this->assertSame( 'neutral', $result['classification'] );
	}

	/**
	 * A regular outline still resolves through the Q ID lookup.
	 */
	public function testRegularOutlineStillResolvesByQId(): void {
		$validator = $this->getValidator( self::GENERIC_OUTLINE, self::COMPANY_OUTLINE );

		$recommended = $validator->validate( 'https://ft.com/content/x', 'Q4830453' );
		$this->assertSame( 'recommended', $recommended['classification'] );

		$discouraged = $validator->validate( 'https://prnewswire.com/pr/x', 'Q4830453' );
		$this->assertSame( 'discouraged', $discouraged['classification'] );
	}

	/**
	 * A session with no outline selected passes null, which must not pick up
	 * the generic outline's lists.
	 */
	public function testNullOutlineDoesNotUseTheGenericLists(): void {
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->expects( $this->never() )->method( 'getGenericOutline' );
		$outlineService->expects( $this->never() )->method( 'getOutlineByQId' );

		$encoder = $this->createMock( UrlAsciiEncoder::class );
		$encoder->method( 'encode' )->willReturnArgument( 0 );

		$validator = new SourceValidator(
			null,
			$this->createMock( UserFactory::class ),
			$outlineService,
			$encoder
		);

		$result = $validator->validate( 'https://facebook.com/some-page', null );
		$this->assertSame( 'neutral', $result['classification'] );
	}
}
