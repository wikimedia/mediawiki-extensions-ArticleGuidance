<?php

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Category\Category;
use MediaWiki\Page\ParserOutputAccess;
use MediaWiki\Page\WikiPageFactory;
use MediaWiki\Parser\ParserOptions;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;

/**
 * Service for managing article guidance outlines
 */
class OutlineService {

	private TitleFactory $titleFactory;
	private WikiPageFactory $wikiPageFactory;
	private ParserOutputAccess $parserOutputAccess;

	public function __construct(
		TitleFactory $titleFactory,
		WikiPageFactory $wikiPageFactory,
		ParserOutputAccess $parserOutputAccess
	) {
		$this->titleFactory = $titleFactory;
		$this->wikiPageFactory = $wikiPageFactory;
		$this->parserOutputAccess = $parserOutputAccess;
	}

	/**
	 * Get all outlines in the wiki
	 *
	 * @return array Array of outline data with id, name, and summary fields
	 */
	public function getOutlines(): array {
		// Get the tracking category name from the message
		$categoryName = wfMessage( 'articleguidance-tracking-category' )
			->inContentLanguage()
			->text();

		// Use MediaWiki's Category system instead of raw database queries
		$categoryTitle = $this->titleFactory->makeTitle( NS_CATEGORY, $categoryName );

		if ( !$categoryTitle->exists() ) {
			return [];
		}

		// Get category members using the Category class
		$category = Category::newFromTitle( $categoryTitle );
		$members = $category->getMembers();

		$outlines = [];

		foreach ( $members as $member ) {
			if ( !$member instanceof Title ) {
				continue;
			}

			// Get all page data in a single ParserOutput fetch
			$pageData = $this->getPageData( $member );

			if ( $pageData && isset( $pageData['articleType'] ) ) {
				$wikidataId = $pageData['articleType'];

				$description = $pageData['description'] ?? '';
				if ( $description !== '' ) {
					$description = ucfirst( $description );
				}

				$outlines[] = [
					'title' => $member->getPrefixedText(),
					'label' => $pageData['label'] ?? $wikidataId,
					'description' => $description,
					'articleType' => $wikidataId,
					'instructions' => $pageData['instructions'] ?? null,
					'thumbnail' => $pageData['image'] ?? null,
					'notabilityRisk' => $pageData['notabilityRisk'] ?? false,
					'hierarchyDepth' => $pageData['hierarchyDepth'] ?? null
				];
			}
		}

		return $outlines;
	}

	/**
	 * Get all page data from a single ParserOutput fetch
	 *
	 * Fetches ParserOutput once and extracts guidance data, sections, and instructions
	 *
	 * @param Title $title Page title
	 * @return array|null Array with articleType, label, description, image, notabilityRisk,
	 * 	hierarchyDepth, sections, instructions or null if not found
	 */
	private function getPageData( Title $title ): ?array {
		if ( !$title->exists() ) {
			return null;
		}

		$wikiPage = $this->wikiPageFactory->newFromTitle( $title );
		$parserOptions = ParserOptions::newFromAnon();

		$status = $this->parserOutputAccess->getParserOutput(
			$wikiPage,
			$parserOptions
		);

		if ( !$status->isOK() ) {
			return null;
		}

		$parserOutput = $status->getValue();

		// Extract article guidance data (includes articleType, label, description, image)
		$guidanceData = $parserOutput->getExtensionData( 'ArticleGuidance:data' );
		if ( !is_array( $guidanceData ) ) {
			return null;
		}

		// Extract instructions from HTML using DOMDocument
		$instructions = null;
		$html = $parserOutput->getContentHolderText();
		if ( $html ) {
			$dom = new \DOMDocument();
			$dom->loadHTML( '<?xml encoding="utf-8" ?>' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD );
			$xpath = new \DOMXPath( $dom );

			// Find the div with class ext-articleguidance-content
			$nodes = $xpath->query( '//div[@class="ext-articleguidance-content"]' );
			if ( $nodes && $nodes->length > 0 ) {
				// Get the inner HTML content
				$contentNode = $nodes->item( 0 );
				$innerHTML = '';
				foreach ( $contentNode->childNodes as $child ) {
					$innerHTML .= $dom->saveHTML( $child );
				}
				$instructions = trim( $innerHTML );
			}
		}

		// Merge guidance data (already includes image) with sections and instructions
		return array_merge( $guidanceData, [
			'instructions' => $instructions
		] );
	}
}
