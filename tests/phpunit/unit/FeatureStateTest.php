<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Config\HashConfig;
use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\FeatureState
 */
class FeatureStateTest extends MediaWikiUnitTestCase {

	private function getFeatureState( bool $enabled, bool $redirectEnabled ): FeatureState {
		return new FeatureState( new HashConfig( [
			'ArticleGuidanceEnabled' => $enabled,
			'ArticleGuidanceRedirectEnabled' => $redirectEnabled,
		] ) );
	}

	public static function provideStates(): array {
		return [
			'both off' => [ false, false, false, false ],
			'global off, redirect on' => [ false, true, false, false ],
			'global on, redirect off' => [ true, false, true, false ],
			'both on' => [ true, true, true, true ],
		];
	}

	/**
	 * @dataProvider provideStates
	 */
	public function testState(
		bool $enabled,
		bool $redirectEnabled,
		bool $expectedEnabled,
		bool $expectedRedirectEnabled
	): void {
		$featureState = $this->getFeatureState( $enabled, $redirectEnabled );

		$this->assertSame( $expectedEnabled, $featureState->isEnabled() );
		$this->assertSame(
			$expectedRedirectEnabled,
			$featureState->isRedirectEnabled(),
			'The global switch has precedence over the redirect setting.'
		);
	}
}
