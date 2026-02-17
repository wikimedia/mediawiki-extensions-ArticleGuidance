<?php

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Rest\Handler;
use MediaWiki\Rest\Response;

/**
 * REST handler for listing article guidance outlines
 */
class ListOutlinesHandler extends Handler {

	private OutlineService $outlineService;

	public function __construct( OutlineService $outlineService ) {
		$this->outlineService = $outlineService;
	}

	/**
	 * @return Response
	 */
	public function execute(): Response {
		try {
			$outlines = $this->outlineService->getOutlines();
			return $this->getResponseFactory()->createJson( [
				'outlines' => $outlines
			] );
		} catch ( \Exception $e ) {
			return $this->getResponseFactory()->createHttpError( 500, [
				'message' => 'Failed to fetch outlines: ' . $e->getMessage()
			] );
		}
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
