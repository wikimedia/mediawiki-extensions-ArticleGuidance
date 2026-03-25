<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

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

		if ( !str_contains( $url, '://' ) ) {
			$url = 'https://' . $url;
		}

		if ( !filter_var( $url, FILTER_VALIDATE_URL ) ) {
			return $this->getResponseFactory()->createHttpError( 400, [
				'message' => 'Invalid URL'
			] );
		}

		$outlineQId = $this->getValidatedParams()['outlineQId'];

		return $this->getResponseFactory()->createJson(
			$this->sourceValidator->validate( $url, $outlineQId )
		);
	}
}
