<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use InvalidArgumentException;
use MediaWiki\Extension\ArticleGuidance\Services\SourceValidator;
use MediaWiki\Rest\Handler;
use MediaWiki\Rest\Response;
use Wikimedia\ParamValidator\ParamValidator;

/**
 * REST handler for validating article sources
 */
class ValidateSourceHandler extends Handler {

	public function __construct(
		private readonly SourceValidator $sourceValidator,
	) {
	}

	/**
	 * @return bool
	 */
	public function needsWriteAccess(): bool {
		return false;
	}

	/**
	 * @return array
	 */
	public function getParamSettings(): array {
		return [
			'url' => [
				self::PARAM_SOURCE => 'query',
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_REQUIRED => true,
			],
			'outlineQId' => [
				self::PARAM_SOURCE => 'query',
				ParamValidator::PARAM_TYPE => 'string',
				ParamValidator::PARAM_REQUIRED => false,
				ParamValidator::PARAM_DEFAULT => null,
			],
		];
	}

	/**
	 * @return Response
	 */
	public function execute(): Response {
		$url = $this->getValidatedParams()['url'];
		$outlineQId = $this->getValidatedParams()['outlineQId'];

		try {
			$result = $this->sourceValidator->validate( $url, $outlineQId );
		} catch ( InvalidArgumentException ) {
			return $this->getResponseFactory()->createHttpError( 400, [
				'message' => 'Invalid URL'
			] );
		}

		return $this->getResponseFactory()->createJson( $result );
	}
}
