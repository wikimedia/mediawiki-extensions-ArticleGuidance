<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Rest;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Rest\Handler;
use MediaWiki\Rest\Response;

/**
 * REST handler for listing article guidance outlines.
 *
 * Serves both /v0/outlines and /v1/outlines with the same payload.
 *
 * The ETag is a hash of the payload, so the validator comes from the response
 * bytes. The page_touched timestamp that getLastModified() returns comes from
 * page edits instead. It does not move when a refreshLinks run rewrites
 * page_props, and it does not move when the response shape changes. It cannot
 * be the only validator.
 *
 * A breaking change to the response shape still needs a new path version. Keep
 * the old path for one release, because JS bundles cached across the deploy
 * request it and must not get a 404 (T421260).
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
		$response = $this->getResponseFactory()->createJson( $this->getPayload() );
		// s-maxage applies to shared caches only. It gives a browser no
		// freshness lifetime, and the browser then computes one from
		// Last-Modified and sends no conditional request. max-age=0 and
		// must-revalidate remove that lifetime.
		$response->setHeader( 'Cache-Control', 'public, s-maxage=300, max-age=0, must-revalidate' );
		return $response;
	}

	/** @inheritDoc */
	protected function getLastModified() {
		return $this->outlineService->getLastModified();
	}

	/** @inheritDoc */
	protected function getETag(): ?string {
		// OutlineService memoizes the data per request, so this adds no query.
		// getLastModified() above already does the same fetch.
		$json = json_encode( $this->getPayload() );
		if ( $json === false ) {
			return null;
		}
		return '"' . sha1( $json ) . '"';
	}

	/**
	 * Build the response payload.
	 *
	 * execute() and getETag() both call this, so the hash covers the same data
	 * that the body contains.
	 *
	 * @return array
	 */
	private function getPayload(): array {
		return [ 'outlines' => $this->outlineService->getOutlines() ];
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
