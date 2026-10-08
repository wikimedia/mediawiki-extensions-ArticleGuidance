<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Http\HttpRequestFactory;
use MediaWiki\Json\FormatJson;
use Psr\Log\LoggerInterface;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * Client for the LiftWing reference-risk model, in single domain mode.
 *
 * @see https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language-agnostic_reference_risk
 */
class ReferenceRiskClient {

	public function __construct(
		private readonly HttpRequestFactory $httpRequestFactory,
		private readonly WANObjectCache $cache,
		private readonly LoggerInterface $logger,
		private readonly string $baseUrl,
		private readonly ?string $hostHeader,
		private readonly string $userAgent,
		private readonly string $languageCode,
	) {
	}

	/**
	 * Whether the model marks a domain as risky on this wiki: the perennial
	 * sources list deprecates or blocks it.
	 *
	 * @param string $domain
	 * @return bool False when the model has no data for the domain or is not available
	 */
	public function isRisky( string $domain ): bool {
		$result = $this->cache->getWithSetCallback(
			$this->cache->makeKey( 'articleguidance', 'referencerisk', $this->languageCode, $domain ),
			WANObjectCache::TTL_DAY,
			function ( $oldValue, &$ttl ) use ( $domain ) {
				$result = $this->fetchDomain( $domain );
				if ( $result === null ) {
					// Keep the failure for a short time, so that an outage or an unsupported
					// wiki does not send a request and wait for each source.
					$ttl = WANObjectCache::TTL_MINUTE * 5;
					return [ 'isRisky' => false ];
				}
				return $result;
			}
		);
		return $result['isRisky'];
	}

	/**
	 * @param string $domain
	 * @return array|null Null on failure
	 */
	private function fetchDomain( string $domain ): ?array {
		$url = rtrim( $this->baseUrl, '/' ) . '/reference-risk:predict';
		$request = $this->httpRequestFactory->create( $url, [
			'method' => 'POST',
			'postData' => FormatJson::encode( [
				'domain' => $domain,
				'lang' => $this->languageCode,
			] ),
			// The user waits for this request in the sources step.
			'timeout' => 2,
		], __METHOD__ );
		$request->setHeader( 'Content-Type', 'application/json' );
		$request->setHeader( 'User-Agent', $this->userAgent );
		if ( $this->hostHeader ) {
			$request->setHeader( 'Host', $this->hostHeader );
		}

		$status = $request->execute();
		$data = FormatJson::decode( $request->getContent() ?? '', true );
		if ( !$status->isOK() || !is_array( $data ) || !array_key_exists( 'domain_metadata', $data ) ) {
			$this->logger->warning( 'Reference risk request failed', [
				'domain' => $domain,
				'lang' => $this->languageCode,
				'status' => $request->getStatus(),
			] );
			return null;
		}

		// The metadata is null when the model has no data for the domain.
		$metadata = $data['domain_metadata'];
		return [ 'isRisky' => is_array( $metadata ) && ( $metadata['is_risky'] ?? false ) === true ];
	}
}
