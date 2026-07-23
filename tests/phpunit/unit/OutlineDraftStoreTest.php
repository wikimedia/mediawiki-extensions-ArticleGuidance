<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineDraftStore;
use MediaWiki\Session\Session;
use MediaWiki\User\UserIdentityValue;
use MediaWikiUnitTestCase;
use Wikimedia\ObjectCache\HashBagOStuff;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\OutlineDraftStore
 */
class OutlineDraftStoreTest extends MediaWikiUnitTestCase {

	private function makeSession( string $id ): Session {
		$session = $this->createMock( Session::class );
		$session->method( 'getId' )->willReturn( $id );
		return $session;
	}

	public function testRegisteredUserGetsDraftInAnotherSession(): void {
		$store = new OutlineDraftStore( new HashBagOStuff() );
		$user = new UserIdentityValue( 7, 'Maintainer' );
		$store->set( $user, $this->makeSession( 'a' ), [ 'Q5' ], 'Draft' );

		$this->assertSame( 'Draft', $store->get( $user, $this->makeSession( 'b' ), [ 'Q5' ] ) );
		$this->assertNull( $store->get( $user, $this->makeSession( 'a' ), [ 'Q6' ] ) );
		$this->assertNull( $store->get( new UserIdentityValue( 8, 'Other' ), $this->makeSession( 'a' ), [ 'Q5' ] ) );
	}

	public function testEachSetOfTypesHasItsOwnDraft(): void {
		$store = new OutlineDraftStore( new HashBagOStuff() );
		$user = new UserIdentityValue( 7, 'Maintainer' );
		$session = $this->makeSession( 'a' );
		$store->set( $user, $session, [ 'Q5', 'Q6' ], 'Draft for Q5 and Q6' );
		$store->set( $user, $session, [ 'Q5', 'Q7' ], 'Draft for Q5 and Q7' );

		$this->assertSame( 'Draft for Q5 and Q6', $store->get( $user, $session, [ 'Q5', 'Q6' ] ) );
		$this->assertSame( 'Draft for Q5 and Q7', $store->get( $user, $session, [ 'Q5', 'Q7' ] ) );
	}

	public function testAnonymousDraftBelongsToSession(): void {
		$store = new OutlineDraftStore( new HashBagOStuff() );
		$anon = new UserIdentityValue( 0, '127.0.0.1' );
		$store->set( $anon, $this->makeSession( 'a' ), [ 'Q5' ], 'Draft' );

		$this->assertSame( 'Draft', $store->get( $anon, $this->makeSession( 'a' ), [ 'Q5' ] ) );
		$this->assertNull( $store->get( $anon, $this->makeSession( 'b' ), [ 'Q5' ] ) );
	}
}
