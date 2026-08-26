<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Api\ApiEditPage;
use MediaWiki\Api\ApiQuery;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Hooks\EditTagHandler;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Page\WikiPage;
use MediaWiki\Request\FauxRequest;
use MediaWiki\Revision\RevisionRecord;
use MediaWiki\Title\Title;
use MediaWiki\User\UserIdentityValue;
use MediaWikiIntegrationTestCase;
use Wikimedia\ParamValidator\ParamValidator;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\EditTagHandler
 */
class EditTagHandlerTest extends MediaWikiIntegrationTestCase {

	private const TITLE = 'ArticleGuidanceTaggedPage';

	/**
	 * Both strings are contracts rather than internals: the change tag is wiki
	 * facing, and the request parameter is hardcoded by the client. Spelling them
	 * out here means a rename has to be a deliberate change to this test too.
	 */
	private const TAG = 'articleguidance';
	private const API_PARAM = 'articleguidance';

	private function getHandler(): EditTagHandler {
		$instrumentFactory = $this->createMock( ArticleGuidanceInstrumentFactory::class );
		$instrumentFactory->method( 'getInstrument' )->willReturn( null );
		return new EditTagHandler( $instrumentFactory );
	}

	/**
	 * Put a request carrying the given parameters on the main context, which is
	 * where the hook reads from.
	 *
	 * @param array $params
	 */
	private function setMainRequest( array $params ): void {
		RequestContext::getMain()->setRequest( new FauxRequest( $params ) );
	}

	/**
	 * @param bool $isRedirect Whether the saved content is a redirect
	 * @return array{0: WikiPage, 1: RevisionRecord}
	 */
	private function makeFirstRevision( bool $isRedirect = true ): array {
		$title = Title::makeTitle( NS_MAIN, self::TITLE );

		$wikiPage = $this->createMock( WikiPage::class );
		$wikiPage->method( 'getTitle' )->willReturn( $title );
		$wikiPage->method( 'getId' )->willReturn( 123 );

		$content = $this->getServiceContainer()
			->getContentHandlerFactory()
			->getContentHandler( CONTENT_MODEL_WIKITEXT )
			->makeRedirectContent( Title::makeTitle( NS_MAIN, 'Target' ) );

		$rev = $this->createMock( RevisionRecord::class );
		// A first revision; later revisions are ignored by the hook.
		$rev->method( 'getParentId' )->willReturn( 0 );
		$rev->method( 'getContent' )->willReturn( $isRedirect ? $content : null );

		return [ $wikiPage, $rev ];
	}

	public function testTagsAnEditCarryingTheMarkerParameter(): void {
		$this->setMainRequest( [ self::API_PARAM => 1 ] );
		[ $wikiPage, $rev ] = $this->makeFirstRevision();

		$tags = [];
		$this->getHandler()->onRevisionFromEditComplete(
			$wikiPage, $rev, false, UserIdentityValue::newRegistered( 1, 'Editor' ), $tags
		);

		$this->assertContains( self::TAG, $tags );
	}

	public function testLeavesAnOrdinaryEditUntagged(): void {
		$this->setMainRequest( [] );
		[ $wikiPage, $rev ] = $this->makeFirstRevision();

		$tags = [];
		$this->getHandler()->onRevisionFromEditComplete(
			$wikiPage, $rev, false, UserIdentityValue::newRegistered( 1, 'Editor' ), $tags
		);

		$this->assertSame( [], $tags );
	}

	public function testTagsAnEditRecordedInTheSession(): void {
		// The publish flow's path: BeforeInitialize recorded the title on the way
		// into the editor, and no marker parameter is present on the save.
		$this->setMainRequest( [] );
		$session = RequestContext::getMain()->getRequest()->getSession();
		$session->set( EditTagHandler::SESSION_EDITING, [
			Title::makeTitle( NS_MAIN, self::TITLE )->getPrefixedText() => true,
		] );
		[ $wikiPage, $rev ] = $this->makeFirstRevision( false );

		$tags = [];
		$this->getHandler()->onRevisionFromEditComplete(
			$wikiPage, $rev, false, UserIdentityValue::newRegistered( 1, 'Editor' ), $tags
		);

		$this->assertContains( self::TAG, $tags );
		$published = $session->get( EditTagHandler::SESSION_PUBLISHED );
		$this->assertArrayHasKey(
			Title::makeTitle( NS_MAIN, self::TITLE )->getPrefixedText(),
			$published,
			'the title moves to the published set for the follow-up module'
		);
	}

	public function testDeclaresTheMarkerParameterOnEditOnly(): void {
		$handler = $this->getHandler();

		$editParams = [];
		$handler->onAPIGetAllowedParams(
			$this->createMock( ApiEditPage::class ), $editParams, 0
		);
		$this->assertArrayHasKey( self::API_PARAM, $editParams );
		$this->assertSame(
			'boolean',
			$editParams[ self::API_PARAM ][ ParamValidator::PARAM_TYPE ]
		);

		$otherParams = [];
		$handler->onAPIGetAllowedParams(
			$this->createMock( ApiQuery::class ), $otherParams, 0
		);
		$this->assertSame( [], $otherParams, 'other modules are left alone' );
	}
}
