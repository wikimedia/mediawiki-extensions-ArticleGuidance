<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Session\Session;
use MediaWiki\User\UserIdentity;
use Wikimedia\ObjectCache\BagOStuff;

/**
 * Keeps the outline draft that Special:Outlines generates in the browser, until
 * the editor preloads it. Each user has one draft per article type, so a link
 * cannot preload text that another user wrote. Anonymous users all have user
 * ID 0, so their drafts belong to the session.
 */
class OutlineDraftStore {

	/** A draft is only needed between the generation and the opening of the editor */
	private const TTL = BagOStuff::TTL_HOUR;

	public function __construct(
		private readonly BagOStuff $stash,
	) {
	}

	/**
	 * @param UserIdentity $user User who generated the draft
	 * @param Session $session Session of the user. It must be persistent for an anonymous user.
	 * @param string[] $qIds Wikidata Q IDs of the article types. The first is the primary type.
	 * @param string $text Outline wikitext
	 * @return bool Whether the stash kept the draft
	 */
	public function set( UserIdentity $user, Session $session, array $qIds, string $text ): bool {
		return $this->stash->set( $this->makeKey( $user, $session, $qIds ), $text, self::TTL );
	}

	/**
	 * @param UserIdentity $user
	 * @param Session $session
	 * @param string[] $qIds Wikidata Q IDs of the article types. The first is the primary type.
	 * @return string|null Outline wikitext, or null if the user has no draft for these types
	 */
	public function get( UserIdentity $user, Session $session, array $qIds ): ?string {
		$text = $this->stash->get( $this->makeKey( $user, $session, $qIds ) );
		return is_string( $text ) ? $text : null;
	}

	private function makeKey( UserIdentity $user, Session $session, array $qIds ): string {
		$owner = $user->isRegistered() ? 'user-' . $user->getId() : 'session-' . $session->getId();
		// Each set of types has its own draft, so Q1,Q2 and Q1,Q3 do not share one
		return $this->stash->makeKey( 'articleguidance-outline-draft', $owner, implode( ',', $qIds ) );
	}
}
