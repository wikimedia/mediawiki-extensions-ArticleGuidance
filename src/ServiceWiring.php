<?php

declare( strict_types = 1 );

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceInstrumentFactory;
use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\CommonsThumb;
use MediaWiki\Extension\ArticleGuidance\Services\FeatureState;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\ReferenceRiskClient;
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
use MediaWiki\WikiMap\WikiMap;

/** @phpcs-require-sorted-array */
return [
	'ArticleGuidanceConfig' => static function ( MediaWikiServices $services ): Config {
		// The Community Configuration router reads the variables in ArticleGuidanceSchema,
		// and falls back to MainConfig for all the others. Each variable in the schema has a
		// dynamic default that returns the site configuration value, so a wiki with no
		// on-wiki configuration page keeps the behaviour of its site configuration.
		if ( ExtensionRegistry::getInstance()->isLoaded( 'CommunityConfiguration' ) ) {
			return $services->getService( 'CommunityConfiguration.MediaWikiConfigRouter' );
		}
		return $services->getMainConfig();
	},
	'ArticleGuidanceFeatureState' => static function ( MediaWikiServices $services ): FeatureState {
		return new FeatureState(
			$services->getService( 'ArticleGuidanceConfig' )
		);
	},
	'ArticleGuidanceInstrumentFactory' =>
		static function ( MediaWikiServices $services ): ArticleGuidanceInstrumentFactory {
			$instrumentManager = ExtensionRegistry::getInstance()->isLoaded( 'TestKitchen' )
				? $services->getService( 'TestKitchen.InstrumentManager' )
				: null;
			return new ArticleGuidanceInstrumentFactory(
				$services->getMainConfig(),
				$instrumentManager,
				$services->getService( 'ArticleGuidanceFeatureState' ),
			);
		},
	'ArticleGuidanceOutlineService' => static function ( MediaWikiServices $services ): OutlineService {
		return new OutlineService(
			$services->getTitleFactory(),
			$services->getPageProps(),
			$services->getContentLanguage(),
		);
	},
	'ArticleGuidanceReferenceRiskClient' => static function ( MediaWikiServices $services ): ReferenceRiskClient {
		$config = $services->getMainConfig();
		// The model identifies a wiki by the database name without "wiki", e.g. "be_x_old" for
		// be_x_oldwiki. The content language code does not always match it.
		$wikiId = WikiMap::getCurrentWikiId();
		return new ReferenceRiskClient(
			$services->getHttpRequestFactory(),
			$services->getMainWANObjectCache(),
			LoggerFactory::getInstance( 'ArticleGuidance' ),
			$config->get( 'ArticleGuidanceLiftWingBaseUrl' ),
			$config->get( 'ArticleGuidanceLiftWingReferenceRiskHostHeader' ),
			$config->get( 'ArticleGuidanceUserAgent' ),
			str_ends_with( $wikiId, 'wiki' )
				? substr( $wikiId, 0, -strlen( 'wiki' ) )
				: $services->getContentLanguage()->getCode(),
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
			$services->getMainConfig()->get( 'ArticleGuidanceReferenceRiskEnabled' )
				? $services->getService( 'ArticleGuidanceReferenceRiskClient' )
				: null,
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
			new WikidataUrls( $urls ),
			new CommonsThumb()
		);
	},
	'ArticleGuidanceWikidataUrls' => static function ( MediaWikiServices $services ): WikidataUrls {
		return new WikidataUrls(
			$services->getMainConfig()->get( 'ArticleGuidanceWikidataUrls' )
		);
	},
];
