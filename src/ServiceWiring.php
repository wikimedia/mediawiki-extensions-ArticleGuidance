<?php

declare( strict_types = 1 );

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\SourceValidator;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Logger\LoggerFactory;
use MediaWiki\MediaWikiServices;

/** @phpcs-require-sorted-array */
return [
	'ArticleGuidanceOutlineService' => static function ( MediaWikiServices $services ): OutlineService {
		return new OutlineService(
			$services->getTitleFactory(),
			$services->getWikiPageFactory(),
			$services->getParserOutputAccess(),
		);
	},
	'ArticleGuidanceRenderer' => static function ( MediaWikiServices $services ): ArticleGuidanceRenderer {
		return new ArticleGuidanceRenderer();
	},
	'ArticleGuidanceSourceValidator' => static function ( MediaWikiServices $services ): SourceValidator {
		return new SourceValidator();
	},
	'ArticleGuidanceTitleExtractor' => static function ( MediaWikiServices $services ): TitleExtractor {
		return new TitleExtractor();
	},
	'ArticleGuidanceWikidataInfoFetcher' => static function ( MediaWikiServices $services ): WikidataInfoFetcher {
		return new WikidataInfoFetcher(
			$services->getHttpRequestFactory(),
			$services->getContentLanguage(),
			LoggerFactory::getInstance( 'ArticleGuidance' ),
			$services->getMainWANObjectCache()
		);
	},
];
