<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Category\Category;
use MediaWiki\Language\Language;
use MediaWiki\Page\PageProps;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;

/**
 * Service for managing article guidance outlines
 */
class OutlineService {

	/** @var array{outlines: array, lastModified: string|null}|null */
	private ?array $cache = null;

	public function __construct(
		private readonly TitleFactory $titleFactory,
		private readonly PageProps $pageProps,
		private readonly Language $contentLanguage,
	) {
	}

	/**
	 * Get all outlines in the wiki.
	 *
	 * @return array Array of outline data
	 */
	public function getOutlines(): array {
		return $this->getData()['outlines'];
	}

	/**
	 * Get a single outline by any of its Wikidata Q-IDs, or null if not found.
	 *
	 * @param string $qId
	 * @return array|null
	 */
	public function getOutlineByQId( string $qId ): ?array {
		foreach ( $this->getOutlines() as $outline ) {
			foreach ( $outline['articleTypes'] as $typeEntry ) {
				if ( $typeEntry['id'] === $qId ) {
					return $outline;
				}
			}
		}
		return null;
	}

	/**
	 * Get the timestamp of the most recently touched category member.
	 * Used by the REST handler for Last-Modified / 304 support.
	 *
	 * @return string|null MW timestamp, or null if the category is empty
	 */
	public function getLastModified(): ?string {
		return $this->getData()['lastModified'];
	}

	/**
	 * @return array{outlines: array, lastModified: string|null}
	 */
	private function getData(): array {
		$this->cache ??= $this->fetchData();
		return $this->cache;
	}

	/**
	 * Fetch all outlines and the max page_touched timestamp from page props.
	 *
	 * @return array{outlines: array, lastModified: string|null}
	 */
	private function fetchData(): array {
		$categoryTitle = $this->titleFactory->makeTitle( NS_CATEGORY, $this->getCategoryName() );
		$members = $this->getCategoryMembers( $categoryTitle );

		$memberList = [];
		$lastModified = null;
		foreach ( $members as $member ) {
			$touched = $member->getTouched();
			if ( $touched !== null && ( $lastModified === null || $touched > $lastModified ) ) {
				$lastModified = $touched;
			}
			$memberList[] = $member;
		}

		$propsById = $this->pageProps->getProperties( $memberList, 'articleguidance-data' );

		$outlines = [];
		foreach ( $memberList as $member ) {
			$pageId = $member->getArticleID();
			if ( !isset( $propsById[$pageId] ) ) {
				continue;
			}
			$pageData = json_decode( $propsById[$pageId], true );
			if ( !is_array( $pageData ) ) {
				continue;
			}
			// Synthesize the per-ID list for blobs persisted before multi-item
			// support (T421260). This is the only place the page property is
			// read, so downstream consumers (REST, JS) can rely on articleTypes
			// unconditionally.
			$articleTypes = $pageData['articleTypes'] ?? [ [
				'id' => $pageData['articleType'],
				'hierarchyDepth' => $pageData['hierarchyDepth'] ?? null,
				'matchVia' => $pageData['matchVia'] ?? null,
			] ];
			// Capitalize the first letter at read time so labels persisted in
			// page_props before the capitalization fix (T427201) are corrected
			// without waiting for the pages to be re-parsed.
			$label = $this->contentLanguage->ucfirst( $pageData['label'] ?? $articleTypes[0]['id'] );
			$outlines[] = [
				'title' => $member->getPrefixedText(),
				'label' => $label,
				'description' => $pageData['description'] ?? '',
				'articleTypes' => $articleTypes,
				// The primary entry is also exposed through the pre-multi-item
				// singular fields, so JS bundles still cached from before the
				// deploy keep matching on it (T421260). TODO: Drop these three keys
				// together with the /v0 route once that window has passed.
				'articleType' => $articleTypes[0]['id'],
				'hierarchyDepth' => $articleTypes[0]['hierarchyDepth'] ?? null,
				'matchVia' => $articleTypes[0]['matchVia'] ?? null,
				'instructions' => $pageData['instructions'] ?? null,
				'thumbnail' => $pageData['image'] ?? null,
				'notabilityRisk' => $pageData['notabilityRisk'] ?? [],
				'recommendedSources' => $pageData['recommendedSources'] ?? [],
				'discouragedSources' => $pageData['discouragedSources'] ?? [],
			];
		}

		return [ 'outlines' => $outlines, 'lastModified' => $lastModified ];
	}

	/**
	 * Get category members for the given category title.
	 *
	 * Protected to allow overriding in tests.
	 *
	 * @param Title $categoryTitle
	 * @return iterable<Title>
	 */
	protected function getCategoryMembers( Title $categoryTitle ): iterable {
		$category = Category::newFromTitle( $categoryTitle );
		return $category->getMembers();
	}

	private function getCategoryName(): string {
		return wfMessage( 'articleguidance-tracking-category' )
			->inContentLanguage()
			->text();
	}
}
