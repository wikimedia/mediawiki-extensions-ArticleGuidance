<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Rest\Handler;
use MediaWiki\Rest\Response;

/**
 * REST handler for listing article guidance outlines.
 *
 * Serves both /v0/outlines and /v1/outlines with the same payload. Freshness is
 * keyed on category-member page_touched alone (see getLastModified()), so a
 * client holding a cached body revalidates into a 304 until an outline page is
 * edited — a change to the response shape would otherwise never reach it. Any
 * such change therefore needs a new path version, with the old one kept for a
 * release so JS bundles cached across the deploy do not 404 (T421260).
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
