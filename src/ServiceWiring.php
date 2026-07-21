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
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
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
			$services->getContentLanguage(),
		);
	},
	'ArticleGuidanceRenderer' => static function ( MediaWikiServices $services ): ArticleGuidanceRenderer {
		return new ArticleGuidanceRenderer(
			$services->getService( 'ArticleGuidanceWikidataUrls' )
		);
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
		// The server's SPARQL requests may need a different (proxied) endpoint than
		// the browser; 'api' and 'view' are shared with the client.
		$urls = $config->get( 'ArticleGuidanceWikidataUrls' );
		$urls['sparql'] = $config->get( 'ArticleGuidanceSparqlEndpoint' );
		return new WikidataInfoFetcher(
			$services->getHttpRequestFactory(),
			$services->getLanguageFactory(),
			LoggerFactory::getInstance( 'ArticleGuidance' ),
			$services->getMainWANObjectCache(),
			$config->get( 'ArticleGuidanceMatchViaRules' ),
			$config->get( 'ArticleGuidanceUserAgent' ),
			new WikidataUrls( $urls )
		);
	},
	'ArticleGuidanceWikidataUrls' => static function ( MediaWikiServices $services ): WikidataUrls {
		return new WikidataUrls(
			$services->getMainConfig()->get( 'ArticleGuidanceWikidataUrls' )
		);
	},
];
