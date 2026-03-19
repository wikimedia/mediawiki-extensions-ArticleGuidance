<?php

declare( strict_types = 1 );

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\SourceValidator;
use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\SpamBlacklist\BaseBlacklist;
use MediaWiki\Extension\TestKitchen\Sdk\ExperimentManagerInterface;
use MediaWiki\Logger\LoggerFactory;
use MediaWiki\MediaWikiServices;
use MediaWiki\Registration\ExtensionRegistry;

/** @phpcs-require-sorted-array */
return [
	'ArticleGuidanceExperimentManager' =>
		static function ( MediaWikiServices $services ): ?ExperimentManagerInterface {
			if ( !ExtensionRegistry::getInstance()->isLoaded( 'TestKitchen' ) ) {
				return null;
			}
			return $services->getService( 'TestKitchen.ExperimentManager' );
		},
	'ArticleGuidanceOutlineService' => static function ( MediaWikiServices $services ): OutlineService {
		return new OutlineService(
			$services->getTitleFactory(),
			$services->getWikiPageFactory(),
			$services->getParserOutputAccess(),
			$services->getMainWANObjectCache(),
		);
	},
	'ArticleGuidanceRenderer' => static function ( MediaWikiServices $services ): ArticleGuidanceRenderer {
		return new ArticleGuidanceRenderer();
	},
	'ArticleGuidanceSourceValidator' => static function ( MediaWikiServices $services ): SourceValidator {
		$spamBlacklist = ExtensionRegistry::getInstance()->isLoaded( 'SpamBlacklist' )
			? BaseBlacklist::getSpamBlacklist()
			: null;
		return new SourceValidator(
			$spamBlacklist,
			$services->getUserFactory(),
		);
	},
	'ArticleGuidanceTagContentExtractorService' => static function (
		MediaWikiServices $services
	): TagContentExtractorService {
		return new TagContentExtractorService();
	},
	'ArticleGuidanceTitleExtractor' => static function ( MediaWikiServices $services ): TitleExtractor {
		return new TitleExtractor();
	},
	'ArticleGuidanceWikidataInfoFetcher' => static function ( MediaWikiServices $services ): WikidataInfoFetcher {
		return new WikidataInfoFetcher(
			$services->getHttpRequestFactory(),
			$services->getContentLanguage(),
			LoggerFactory::getInstance( 'ArticleGuidance' ),
			$services->getMainWANObjectCache(),
			$services->getMainConfig()->get( 'ArticleGuidanceMatchViaRules' )
		);
	},
];
