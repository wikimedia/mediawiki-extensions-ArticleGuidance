<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineDraftStore;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Rest\LocalizedHttpException;
use MediaWiki\Rest\Response;
use MediaWiki\Rest\SimpleHandler;
use MediaWiki\Rest\TokenAwareHandlerTrait;
use MediaWiki\Rest\Validator\Validator;
use MediaWiki\User\UserFactory;
use Wikimedia\Message\MessageValue;
use Wikimedia\ParamValidator\ParamValidator;

/**
 * Keeps an outline draft that the browser generated, so the editor can preload it.
 *
 * Serves POST /v1/outline-draft/{types}. The types are comma-separated Q IDs, as in
 * Special:Outlines/<Q IDs>. The first is the primary type.
 */
class SaveOutlineDraftHandler extends SimpleHandler {
	use TokenAwareHandlerTrait;

	/** Rate limit, defined in extension.json */
	private const RATE_LIMIT = 'articleguidance-outline-draft';

	public function __construct(
		private readonly OutlineDraftStore $draftStore,
		private readonly Config $config,
		private readonly UserFactory $userFactory,
	) {
	}

	/** @inheritDoc */
	public function validate( Validator $restValidator ): void {
		parent::validate( $restValidator );
		$this->validateToken( true );
	}

	/**
	 * @param string $types
	 * @return Response
	 */
	public function run( string $types ): Response {
		$qIds = OutlineService::parseArticleTypes( $types );
		if ( $qIds === [] ) {
			throw new LocalizedHttpException(
				new MessageValue( 'articleguidance-rest-invalid-qid', [ $types ] ), 400
			);
		}
		$body = $this->getValidatedBody() ?? [];
		$text = $body['text'];
		if ( strlen( $text ) > $this->config->get( 'MaxArticleSize' ) * 1024 ) {
			throw new LocalizedHttpException(
				new MessageValue( 'articleguidance-rest-draft-too-large' ), 413
			);
		}
		// The draft only goes to the editor. The wiki decides who can save the page.
		$authority = $this->getAuthority();
		if ( $this->userFactory->newFromAuthority( $authority )->pingLimiter( self::RATE_LIMIT ) ) {
			throw new LocalizedHttpException( new MessageValue( 'actionthrottledtext' ), 429 );
		}

		// An anonymous draft belongs to the session, so the editor request must get the same session
		$session = $this->getSession();
		if ( !$authority->isRegistered() && !$session->isPersistent() ) {
			$session->persist();
		}
		if ( !$this->draftStore->set( $authority->getUser(), $session, $qIds, $text ) ) {
			throw new LocalizedHttpException(
				new MessageValue( 'articleguidance-rest-draft-failed' ), 500
			);
		}
		return $this->getResponseFactory()->createJson( [ 'types' => $qIds ] );
	}

	/** @inheritDoc */
	public function getParamSettings(): array {
		return [
			'types' => [
				self::PARAM_SOURCE => 'path',
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_REQUIRED => true,
			],
		];
	}

	/** @inheritDoc */
	public function getBodyParamSettings(): array {
		return [
			'text' => [
				self::PARAM_SOURCE => 'body',
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_REQUIRED => true,
			],
		] + $this->getTokenParamDefinition();
	}
}
