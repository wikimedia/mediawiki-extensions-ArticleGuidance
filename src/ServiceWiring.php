<?php

declare( strict_types = 1 );

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceExperimentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\SourceValidator;
use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\ArticleGuidance\Services\UrlAsciiEncoder;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\SpamBlacklist\BaseBlacklist;
use MediaWiki\Logger\LoggerFactory;
use MediaWiki\MediaWikiServices;
use MediaWiki\Registration\ExtensionRegistry;

/** @phpcs-require-sorted-array */
return [
	'ArticleGuidanceExperimentFactory' =>
		static function ( MediaWikiServices $services ): ArticleGuidanceExperimentFactory {
			$experimentManager = ExtensionRegistry::getInstance()->isLoaded( 'TestKitchen' )
				? $services->getService( 'TestKitchen.ExperimentManager' )
				: null;
			return new ArticleGuidanceExperimentFactory(
				$services->getMainConfig(),
				$experimentManager,
			);
		},
	'ArticleGuidanceOutlineService' => static function ( MediaWikiServices $services ): OutlineService {
		return new OutlineService(
			$services->getTitleFactory(),
			$services->getPageProps(),
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
			$services->getService( 'ArticleGuidanceOutlineService' ),
			new UrlAsciiEncoder(),
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
		$config = $services->getMainConfig();
		return new WikidataInfoFetcher(
			$services->getHttpRequestFactory(),
			$services->getContentLanguage(),
			LoggerFactory::getInstance( 'ArticleGuidance' ),
			$services->getMainWANObjectCache(),
			$config->get( 'ArticleGuidanceMatchViaRules' ),
			$config->get( 'ArticleGuidanceUserAgent' ),
			$config->get( 'ArticleGuidanceSparqlEndpoint' )
		);
	},
];
