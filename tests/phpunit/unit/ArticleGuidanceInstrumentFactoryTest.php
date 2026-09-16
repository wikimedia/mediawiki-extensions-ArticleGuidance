<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Config\HashConfig;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWiki\Extension\TestKitchen\Sdk\InstrumentInterface;
use MediaWiki\Extension\TestKitchen\Sdk\InstrumentManagerInterface;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory
 */
class ArticleGuidanceInstrumentFactoryTest extends MediaWikiUnitTestCase {

	protected function setUp(): void {
		parent::setUp();
		if ( !interface_exists( InstrumentManagerInterface::class ) ) {
			$this->markTestSkipped( 'The TestKitchen extension is not installed.' );
		}
	}

	private function getFactory( bool $enabled ): ArticleGuidanceInstrumentFactory {
		$instrumentManager = $this->createMock( InstrumentManagerInterface::class );
		$instrumentManager->method( 'getInstrument' )
			->willReturn( $this->createMock( InstrumentInterface::class ) );

		return new ArticleGuidanceInstrumentFactory(
			new HashConfig( [ 'ArticleGuidanceInstrumentName' => 'article-guidance' ] ),
			$instrumentManager,
			new FeatureState( new HashConfig( [ 'ArticleGuidanceEnabled' => $enabled ] ) ),
		);
	}

	public function testNoInstrumentWhenFeatureIsDisabled(): void {
		$this->assertNull(
			$this->getFactory( false )->getInstrument(),
			'A wiki without Article Guidance sends no event, even with an instrument name.'
		);
	}

	public function testInstrumentWhenFeatureIsEnabled(): void {
		$this->assertNotNull( $this->getFactory( true )->getInstrument() );
	}
}
