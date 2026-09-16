<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Config\HashConfig;
use MediaWiki\Extension\ArticleGuidance\Hooks\PreferencesHandler;
use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWiki\User\User;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Hooks\PreferencesHandler
 */
class PreferencesHandlerTest extends MediaWikiUnitTestCase {

	private function getPreferences( bool $enabled, bool $redirectEnabled ): array {
		$featureState = new FeatureState( new HashConfig( [
			'ArticleGuidanceEnabled' => $enabled,
			'ArticleGuidanceRedirectEnabled' => $redirectEnabled,
		] ) );

		$preferences = [];
		( new PreferencesHandler( $featureState ) )
			->onGetPreferences( $this->createMock( User::class ), $preferences );
		return $preferences;
	}

	public function testPreferenceIsHiddenWhenFeatureIsDisabled(): void {
		$this->assertArrayNotHasKey(
			'articleguidance-enable',
			$this->getPreferences( false, true ),
			'The global switch has precedence over the redirect setting.'
		);
	}

	public function testPreferenceIsHiddenWhenRedirectIsDisabled(): void {
		$this->assertArrayNotHasKey(
			'articleguidance-enable',
			$this->getPreferences( true, false )
		);
	}

	public function testPreferenceIsShownWhenRedirectCanHappen(): void {
		$this->assertArrayHasKey(
			'articleguidance-enable',
			$this->getPreferences( true, true )
		);
	}
}
