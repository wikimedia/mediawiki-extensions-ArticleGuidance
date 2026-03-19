<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Rest\Handler;
use MediaWiki\Rest\Response;

/**
 * REST handler for listing article guidance outlines
 */
class ListOutlinesHandler extends Handler {

	public function __construct(
		private readonly OutlineService $outlineService,
	) {
	}

	/**
	 * @return Response
	 */
	public function execute(): Response {
		$response = $this->getResponseFactory()->createJson( [
			'outlines' => $this->outlineService->getOutlines()
		] );
		$response->setHeader( 'Cache-Control', 'public, s-maxage=300' );
		return $response;
	}

	/** @inheritDoc */
	protected function getLastModified() {
		return $this->outlineService->getLastModified();
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
		return [];
	}
}
