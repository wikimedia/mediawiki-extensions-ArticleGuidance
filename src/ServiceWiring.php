<?php

use MediaWiki\Extension\ArticleGuidance\Services\ArticleGuidanceRenderer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\TitleExtractor;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\MediaWikiServices;

return [
	'ArticleGuidanceTitleExtractor' => static function ( MediaWikiServices $services ): TitleExtractor {
		return new TitleExtractor();
	},
	'ArticleGuidanceWikidataInfoFetcher' => static function ( MediaWikiServices $services ): WikidataInfoFetcher {
		return new WikidataInfoFetcher(
			$services->getHttpRequestFactory(),
			$services->getContentLanguage(),
			\MediaWiki\Logger\LoggerFactory::getInstance( 'ArticleGuidance' ),
			$services->getMainWANObjectCache()
		);
	},
	'ArticleGuidanceRenderer' => static function ( MediaWikiServices $services ): ArticleGuidanceRenderer {
		return new ArticleGuidanceRenderer();
	},
	'ArticleGuidanceOutlineService' => static function ( MediaWikiServices $services ): OutlineService {
		return new OutlineService(
			$services->getTitleFactory(),
			$services->getWikiPageFactory(),
			$services->getParserOutputAccess(),
		);
	},
];
