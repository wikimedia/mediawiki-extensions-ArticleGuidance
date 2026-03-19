<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Category\Category;
use MediaWiki\Page\ParserOutputAccess;
use MediaWiki\Page\WikiPageFactory;
use MediaWiki\Parser\ParserOptions;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;
use Wikimedia\ObjectCache\WANObjectCache;

/**
 * Service for managing article guidance outlines
 */
class OutlineService {

	private const CACHE_VERSION = 'v2';

	public function __construct(
		private readonly TitleFactory $titleFactory,
		private readonly WikiPageFactory $wikiPageFactory,
		private readonly ParserOutputAccess $parserOutputAccess,
		private readonly WANObjectCache $cache,
	) {
	}

	/**
	 * Invalidate the outlines list cache.
	 * Called by the tag handler whenever a page's guidance data is written.
	 */
	public function touchOutlinesCheckKey(): void {
		$this->cache->touchCheckKey( $this->makeOutlinesCheckKey() );
	}

	/**
	 * Get all outlines in the wiki.
	 * Result is cached in WAN; cache is invalidated when any outline page is saved.
	 *
	 * @return array Array of outline data
	 */
	public function getOutlines(): array {
		return $this->getCachedData()['outlines'];
	}

	/**
	 * Get the timestamp of the most recently touched category member.
	 * Used by the REST handler for Last-Modified / 304 support.
	 *
	 * @return string|null MW timestamp, or null if the category is empty
	 */
	public function getLastModified(): ?string {
		return $this->getCachedData()['lastModified'];
	}

	/**
	 * Get the cached outlines data, computing it if necessary.
	 *
	 * @return array{outlines: array, lastModified: string|null}
	 */
	private function getCachedData(): array {
		return $this->cache->getWithSetCallback(
			$this->cache->makeKey( 'articleguidance-outlines', self::CACHE_VERSION ),
			WANObjectCache::TTL_WEEK,
			fn () => $this->fetchData(),
			[ 'checkKeys' => [ $this->makeOutlinesCheckKey() ] ]
		);
	}

	/**
	 * Fetch all outlines and the max page_touched timestamp from the parser cache.
	 *
	 * @return array{outlines: array, lastModified: string|null}
	 */
	private function fetchData(): array {
		$categoryTitle = $this->titleFactory->makeTitle( NS_CATEGORY, $this->getCategoryName() );
		$category = Category::newFromTitle( $categoryTitle );
		$members = $category->getMembers();

		$outlines = [];
		$lastModified = null;

		foreach ( $members as $member ) {
			$touched = $member->getTouched();
			if ( $touched !== null && ( $lastModified === null || $touched > $lastModified ) ) {
				$lastModified = $touched;
			}

			$pageData = $this->getPageData( $member );

			if ( $pageData ) {
				$outlines[] = [
					'title' => $member->getPrefixedText(),
					'label' => $pageData['label'] ?? $pageData['articleType'],
					'description' => $pageData['description'] ?? '',
					'articleType' => $pageData['articleType'],
					'matchVia' => $pageData['matchVia'] ?? null,
					'instructions' => $pageData['instructions'] ?? null,
					'thumbnail' => $pageData['image'] ?? null,
					'notabilityRisk' => $pageData['notabilityRisk'] ?? [],
					'hierarchyDepth' => $pageData['hierarchyDepth'] ?? null,
					'notabilityThresholds' => $pageData['notabilityThresholds'] ?? [],
				];
			}
		}

		return [ 'outlines' => $outlines, 'lastModified' => $lastModified ];
	}

	/**
	 * Get article guidance data for a page from its parser output.
	 *
	 * Uses the parser cache when warm (fast). Falls back to a fresh parse when
	 * the cache is cold; WikidataInfoFetcher's own cache keeps this fast.
	 *
	 * @param Title $title
	 * @return array|null null if the page has no article-guidance tag or parse fails
	 */
	private function getPageData( Title $title ): ?array {
		if ( !$title->exists() ) {
			return null;
		}

		$wikiPage = $this->wikiPageFactory->newFromTitle( $title );
		$status = $this->parserOutputAccess->getParserOutput(
			$wikiPage,
			ParserOptions::newFromAnon(),
			null,
			ParserOutputAccess::OPT_FOR_ARTICLE_VIEW
		);

		if ( !$status->isOK() ) {
			return null;
		}

		$guidanceData = $status->getValue()->getExtensionData( 'ArticleGuidance:data' );
		return is_array( $guidanceData ) ? $guidanceData : null;
	}

	private function getCategoryName(): string {
		return wfMessage( 'articleguidance-tracking-category' )
			->inContentLanguage()
			->text();
	}

	private function makeOutlinesCheckKey(): string {
		return $this->cache->makeKey( 'articleguidance-outlines-check', self::CACHE_VERSION );
	}
}
