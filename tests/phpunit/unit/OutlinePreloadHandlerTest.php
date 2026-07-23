<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Config\HashConfig;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Hooks\OutlinePreloadHandler;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineDraftStore;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Request\WebRequest;
use MediaWiki\Session\Session;
use MediaWiki\SpecialPage\SpecialPageFactory;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use MediaWiki\User\User;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\OutlinePreloadHandler
 */
class OutlinePreloadHandlerTest extends MediaWikiUnitTestCase {

	protected function tearDown(): void {
		RequestContext::resetMain();
		parent::tearDown();
	}

	private function makeTitle( int $namespace, string $dbKey ): Title {
		$title = $this->createMock( Title::class );
		$title->method( 'getNamespace' )->willReturn( $namespace );
		$title->method( 'getDBkey' )->willReturn( $dbKey );
		return $title;
	}

	private function runPreload(
		int $namespace,
		string $dbKey,
		array $query,
		string $text = '',
		?string $draft = null,
		array $draftTypes = [ 'Q3305213' ]
	): string {
		$user = $this->createMock( User::class );
		$session = $this->createMock( Session::class );
		$request = $this->createMock( WebRequest::class );
		$request->method( 'getText' )->willReturnCallback(
			static fn ( string $name ) => $query[$name] ?? ''
		);
		$request->method( 'getSession' )->willReturn( $session );
		RequestContext::getMain()->setRequest( $request );
		RequestContext::getMain()->setUser( $user );
		$draftStore = $this->createMock( OutlineDraftStore::class );
		$draftStore->method( 'get' )
			->willReturnCallback(
				static fn ( $draftUser, $draftSession, array $qIds ) =>
					$draftUser === $user && $draftSession === $session && $qIds === $draftTypes ? $draft : null
			);
		$outlineService = $this->createMock( OutlineService::class );
		$outlineService->method( 'getDefaultGenericOutlineWikitext' )->willReturn( 'Default generic outline' );
		$titleFactory = $this->createMock( TitleFactory::class );
		$titleFactory->method( 'newFromText' )->willReturnCallback( function ( string $text ) {
			if ( $text === 'Project:Article guidance' ) {
				return $this->makeTitle( NS_PROJECT, 'Article_guidance' );
			}
			if ( str_starts_with( $text, 'Special:' ) ) {
				return $this->makeTitle( NS_SPECIAL, substr( $text, strlen( 'Special:' ) ) );
			}
			return $this->makeTitle( NS_MAIN, $text );
		} );
		$specialPageFactory = $this->createMock( SpecialPageFactory::class );
		$specialPageFactory->method( 'resolveAlias' )->willReturnCallback( static function ( string $dbKey ) {
			[ $name, $subPage ] = array_pad( explode( '/', $dbKey, 2 ), 2, null );
			return [ $name === 'Outlines' ? 'Outlines' : null, $subPage ];
		} );
		$handler = new OutlinePreloadHandler(
			new HashConfig( [ 'ArticleGuidanceOutlinePagePrefix' => 'Project:Article guidance' ] ),
			$titleFactory,
			$specialPageFactory,
			$draftStore,
			$outlineService
		);
		$handler->onEditFormPreloadText( $text, $this->makeTitle( $namespace, $dbKey ) );
		return $text;
	}

	public function testPreloadsSkeletonForOutlinePage(): void {
		$text = $this->runPreload(
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213' ]
		);
		$this->assertSame( OutlinePreloadHandler::buildSkeleton( [ 'Q3305213' ] ), $text );
		$this->assertStringStartsWith( '<article-guidance article-type="Q3305213">', $text );
		$this->assertStringContainsString( "<instructions>\n</instructions>", $text );
		$this->assertStringContainsString( "<recommended-sources>\n</recommended-sources>", $text );
		$this->assertStringContainsString( "<discouraged-sources>\n</discouraged-sources>", $text );
		$this->assertStringEndsWith( "</article-guidance>\n", $text );
	}

	public function testPreloadsDraftOfUser(): void {
		$text = $this->runPreload(
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213' ],
			'',
			'Generated draft'
		);
		$this->assertSame( 'Generated draft', $text );
	}

	public function testPreloadsSkeletonWithAllTypes(): void {
		$text = $this->runPreload(
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213,Q5' ]
		);
		$this->assertStringStartsWith( '<article-guidance article-type="Q3305213 Q5">', $text );
	}

	public function testPreloadsDraftOfSameTypes(): void {
		$text = $this->runPreload(
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213,Q5' ],
			'',
			'Generated draft',
			[ 'Q3305213', 'Q5' ]
		);
		$this->assertSame( 'Generated draft', $text );
	}

	public function testPreloadsDefaultGuidanceForGenericOutline(): void {
		$text = $this->runPreload(
			NS_PROJECT,
			'Article_guidance/Generic_outline',
			[ 'preload' => 'Special:Outlines/' . OutlineService::GENERIC_ARTICLE_TYPE ]
		);
		$this->assertSame( 'Default generic outline', $text );
	}

	public static function provideIgnoredRequests(): iterable {
		yield 'no parameter' => [ NS_PROJECT, 'Article_guidance/Painting', [], '' ];
		yield 'other special page' => [
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Search/Q3305213' ],
			'',
		];
		yield 'invalid Q ID' => [
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q1" onclick="x' ],
			'',
		];
		yield 'page outside the prefix' => [
			NS_MAIN,
			'Painting',
			[ 'preload' => 'Special:Outlines/Q3305213' ],
			'',
		];
		yield 'same name in another namespace' => [
			NS_MEDIAWIKI,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213' ],
			'',
		];
		yield 'prefix page itself' => [
			NS_PROJECT,
			'Article_guidance',
			[ 'preload' => 'Special:Outlines/Q3305213' ],
			'',
		];
		yield 'explicit preload' => [
			NS_PROJECT,
			'Article_guidance/Painting',
			[ 'preload' => 'Special:Outlines/Q3305213' ],
			'Preloaded text',
		];
	}

	/**
	 * @dataProvider provideIgnoredRequests
	 */
	public function testKeepsTextForOtherRequests( int $namespace, string $dbKey, array $query, string $text ): void {
		$this->assertSame( $text, $this->runPreload( $namespace, $dbKey, $query, $text ) );
	}
}
