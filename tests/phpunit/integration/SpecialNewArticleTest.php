<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Integration;

use MediaWiki\Config\HashConfig;
use MediaWiki\Exception\ErrorPageError;
use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWiki\Extension\ArticleGuidance\Specials\SpecialNewArticle;
use MediaWiki\Tests\Specials\SpecialPageTestBase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Specials\SpecialNewArticle
 */
class SpecialNewArticleTest extends SpecialPageTestBase {

	/** Value of ArticleGuidanceEnabled that the page under test gets. */
	private bool $enabled = true;

	protected function newSpecialPage(): SpecialNewArticle {
		return new SpecialNewArticle(
			$this->getServiceContainer()->getContentLanguage(),
			$this->getServiceContainer()->getMainConfig(),
			$this->getServiceContainer()->getMagicWordFactory(),
			new FeatureState( new HashConfig( [
				'ArticleGuidanceEnabled' => $this->enabled,
			] ) )
		);
	}

	public function testErrorWhenFeatureIsDisabled(): void {
		$this->enabled = false;

		$this->expectException( ErrorPageError::class );
		$this->executeSpecialPage();
	}

	public function testPageWorksWhenFeatureIsEnabled(): void {
		$this->executeSpecialPage();

		// The page has no server-side content, because the client mounts the app in it.
		// Therefore, the test only shows that the page does not stop with an error.
		$this->addToAssertionCount( 1 );
	}
}
