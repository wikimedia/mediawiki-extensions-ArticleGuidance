<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Config\HashConfig;
use MediaWiki\Extension\ArticleGuidance\Hooks\RedLinkRedirectHandler;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\TestKitchen\Sdk\ExperimentInterface;
use MediaWiki\Output\OutputPage;
use MediaWiki\Request\WebRequest;
use MediaWiki\Title\Title;
use MediaWiki\User\Options\UserOptionsLookup;
use MediaWiki\User\User;
use MediaWikiIntegrationTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\RedLinkRedirectHandler
 * @group Database
 */
class RedLinkRedirectHandlerTest extends MediaWikiIntegrationTestCase {

	private function getHandler( bool $inTreatment = true ): RedLinkRedirectHandler {
		// The experiment is typed against TestKitchen's ExperimentInterface, an
		// optional dependency that is not loaded in the default CI phpunit job.
		$this->markTestSkippedIfExtensionNotLoaded( 'TestKitchen' );

		$experiment = $this->createMock( ExperimentInterface::class );
		$experiment->method( 'isAssignedGroup' )->willReturn( $inTreatment );

		$experimentFactory = $this->createMock( ArticleGuidanceExperimentFactory::class );
		$experimentFactory->method( 'getExperiment' )->willReturn( $experiment );

		$userOptionsLookup = $this->createMock( UserOptionsLookup::class );
		$userOptionsLookup->method( 'getBoolOption' )->willReturn( true );

		// Empty referer/category lists => every referer is in scope; junior gate off.
		$config = new HashConfig( [
			'ArticleGuidanceExperimentRefererTitles' => [],
			'ArticleGuidanceExperimentRefererCategories' => [],
			'ArticleGuidanceExperimentEntryPointTitles' => [],
			'ArticleGuidanceExperimentJuniorEditorsOnly' => false,
			'ArticleGuidanceJuniorEditorThreshold' => 100,
		] );

		return new RedLinkRedirectHandler(
			$this->createMock( TitleExtractor::class ),
			$config,
			$this->getServiceContainer()->getTitleFactory(),
			$experimentFactory,
			$userOptionsLookup,
			$this->getServiceContainer()->getConnectionProvider(),
		);
	}

	private function makeRedLinkRequest(): WebRequest {
		$request = $this->createMock( WebRequest::class );
		$request->method( 'getVal' )->willReturnCallback(
			static fn ( $name ) => match ( $name ) {
				'action' => 'edit',
				'redlink' => '1',
				default => null,
			}
		);
		$request->method( 'getCheck' )->willReturn( false );
		$request->method( 'getHeader' )->willReturn( false );
		return $request;
	}

	private function makeUser(): User {
		$user = $this->createMock( User::class );
		$user->method( 'isAnon' )->willReturn( false );
		$user->method( 'isAllowed' )->willReturn( true );
		$user->method( 'getBlock' )->willReturn( null );
		$user->method( 'getEditCount' )->willReturn( 5 );
		return $user;
	}

	private function createAndDeletePage( Title $title ): void {
		$page = $this->getServiceContainer()->getWikiPageFactory()->newFromTitle( $title );
		$this->editPage( $page, 'Content to be deleted' );
		$deletePage = $this->getServiceContainer()->getDeletePageFactory()
			->newDeletePage( $page, $this->getTestSysop()->getAuthority() );
		$deletePage->deleteUnsafe( 'Test deletion for ArticleGuidance' );
		// Drop cached existence so the handler sees a genuine red link.
		$this->getServiceContainer()->getLinkCache()->clear();
	}

	private function createAndMovePage( Title $from, Title $to ): void {
		$page = $this->getServiceContainer()->getWikiPageFactory()->newFromTitle( $from );
		$this->editPage( $page, 'Content to be moved' );
		$movePage = $this->getServiceContainer()->getMovePageFactory()
			->newMovePage( $from, $to );
		// createRedirect = false: no redirect left behind, so $from becomes a red link.
		$movePage->move( $this->getTestSysop()->getUser(), 'Test move for ArticleGuidance', false );
		// Drop cached existence so the handler sees a genuine red link.
		$this->getServiceContainer()->getLinkCache()->clear();
	}

	public function testMovedAwayArticleSkipsExperimentAndDoesNotRedirect(): void {
		$from = Title::makeTitle( NS_MAIN, 'ArticleGuidanceMovedRedLink' );
		$to = Title::makeTitle( NS_MAIN, 'ArticleGuidanceMovedRedLinkTarget' );
		$this->createAndMovePage( $from, $to );
		$freshTitle = $this->getServiceContainer()->getTitleFactory()
			->makeTitle( NS_MAIN, 'ArticleGuidanceMovedRedLink' );

		$output = $this->createMock( OutputPage::class );
		$output->expects( $this->never() )->method( 'redirect' );

		$result = $this->getHandler( true )->onBeforeInitialize(
			$freshTitle, null, $output, $this->makeUser(), $this->makeRedLinkRequest(), null
		);

		$this->assertNull( $result, 'Handler should fall through to the normal editor flow.' );
	}

	public function testDeletedArticleSkipsExperimentAndDoesNotRedirect(): void {
		$title = Title::makeTitle( NS_MAIN, 'ArticleGuidanceDeletedRedLink' );
		$this->createAndDeletePage( $title );
		$freshTitle = $this->getServiceContainer()->getTitleFactory()
			->makeTitle( NS_MAIN, 'ArticleGuidanceDeletedRedLink' );

		$output = $this->createMock( OutputPage::class );
		$output->expects( $this->never() )->method( 'redirect' );

		$result = $this->getHandler( true )->onBeforeInitialize(
			$freshTitle, null, $output, $this->makeUser(), $this->makeRedLinkRequest(), null
		);

		$this->assertNull( $result, 'Handler should fall through to the normal editor flow.' );
	}

	public function testNeverDeletedArticleStillRedirectsTreatmentGroup(): void {
		$title = $this->getServiceContainer()->getTitleFactory()
			->makeTitle( NS_MAIN, 'ArticleGuidanceNeverExistedRedLink' );

		$output = $this->createMock( OutputPage::class );
		$output->expects( $this->once() )->method( 'redirect' );

		$result = $this->getHandler( true )->onBeforeInitialize(
			$title, null, $output, $this->makeUser(), $this->makeRedLinkRequest(), null
		);

		$this->assertFalse( $result, 'Treatment group with no deletion log should redirect.' );
	}
}
