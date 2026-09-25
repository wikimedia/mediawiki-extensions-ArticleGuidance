<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Html\Html;
use MediaWiki\Linker\LinkRenderer;
use MediaWiki\Output\Hook\OutputPageParserOutputHook;
use MediaWiki\Output\OutputPage;
use MediaWiki\Title\Title;

/**
 * Show on an outline page if other outlines claim the same Wikidata items (T424186).
 *
 * The notice is added at view time, not by the tag handler. The parser cache keeps
 * the tag output, and it does not change when another outline is edited or deleted.
 */
class DuplicateOutlineNoticeHandler implements OutputPageParserOutputHook {

	public function __construct(
		private readonly OutlineService $outlineService,
		private readonly LinkRenderer $linkRenderer,
		private readonly WikidataUrls $wikidataUrls,
	) {
	}

	/** @inheritDoc */
	public function onOutputPageParserOutput( $outputPage, $parserOutput ): void {
		// This hook runs on each page view. The page property is in memory, so
		// this test stops all pages that are not outlines before DB access.
		$blob = $parserOutput->getPageProperty( 'articleguidance-data' );
		if ( !is_string( $blob ) ) {
			return;
		}
		$title = $outputPage->getTitle();
		if (
			$title === null
			|| $outputPage->getActionName() !== 'view'
			|| !$outputPage->isRevisionCurrent()
			|| $title->getArticleID() === 0
		) {
			return;
		}
		$pageData = json_decode( $blob, true );
		if ( !is_array( $pageData ) ) {
			return;
		}

		$itemLabels = array_fill_keys( OutlineService::getClaimKeys( $pageData ), null );
		foreach ( OutlineService::getArticleTypes( $pageData ) as $typeEntry ) {
			$itemLabels[$typeEntry['id']] = $typeEntry['itemLabel'] ?? null;
		}
		$duplicates = $this->outlineService->getDuplicates( $title->getArticleID(), array_keys( $itemLabels ) );
		if ( $duplicates === [] ) {
			return;
		}

		$owners = [];
		$activeHtml = '';
		foreach ( $duplicates as $qId => $duplicate ) {
			$owner = $duplicate['owner'];
			if ( $owner !== null ) {
				$owners[$qId] = $owner;
			} else {
				$activeHtml .= $this->getActiveBox( $outputPage, $qId, $itemLabels[$qId], $duplicate['others'] );
			}
		}
		$html = '';
		if ( $owners !== [] ) {
			$isFullyShadowed = count( $owners ) === count( $itemLabels );
			$html .= $this->getInactiveBox( $outputPage, $owners, $itemLabels, $isFullyShadowed );
		}
		$html .= $activeHtml;

		$outputPage->addModuleStyles( [ 'mediawiki.codex.messagebox.styles' ] );
		// The hook runs before the page text is added, so the boxes come first
		$outputPage->addHTML( $html );
	}

	/**
	 * @param OutputPage $outputPage
	 * @param array<string,Title> $owners Owner outline by shadowed Q-ID
	 * @param array<string,?string> $itemLabels
	 * @param bool $isFullyShadowed The page owns none of its Q-IDs
	 * @return string HTML
	 */
	private function getInactiveBox(
		OutputPage $outputPage,
		array $owners,
		array $itemLabels,
		bool $isFullyShadowed
	): string {
		$state = $isFullyShadowed ? 'inactive' : 'partial';
		// Message keys: articleguidance-duplicate-inactive-lead, articleguidance-duplicate-partial-lead
		$html = $this->getLead( $outputPage->msg( "articleguidance-duplicate-$state-lead" )->escaped() );
		foreach ( $owners as $qId => $owner ) {
			if ( $qId === OutlineService::GENERIC_ARTICLE_TYPE ) {
				$detail = $outputPage->msg( 'articleguidance-duplicate-generic-inactive-detail' )
					->rawParams( $this->linkRenderer->makeKnownLink( $owner ) )
					->escaped();
			} else {
				// Message keys: articleguidance-duplicate-inactive-detail,
				// articleguidance-duplicate-partial-detail
				$detail = $outputPage->msg( "articleguidance-duplicate-$state-detail" )->rawParams(
					$this->linkRenderer->makeKnownLink( $owner ),
					$this->getItemHtml( $outputPage, $qId, $itemLabels[$qId] )
				)->escaped();
			}
			$html .= Html::rawElement( 'p', [], $detail );
		}
		return Html::warningBox( $html, 'ext-articleguidance-duplicate-notice' );
	}

	/**
	 * @param OutputPage $outputPage
	 * @param string $qId Q-ID, or OutlineService::GENERIC_ARTICLE_TYPE
	 * @param string|null $itemLabel
	 * @param Title[] $others Outlines that claim the item but do not own it
	 * @return string HTML
	 */
	private function getActiveBox( OutputPage $outputPage, string $qId, ?string $itemLabel, array $others ): string {
		if ( $qId === OutlineService::GENERIC_ARTICLE_TYPE ) {
			$leadHtml = $outputPage->msg( 'articleguidance-duplicate-generic-active-lead' )->escaped();
			$detailKey = 'articleguidance-duplicate-generic-active-detail';
		} else {
			$leadHtml = $outputPage->msg( 'articleguidance-duplicate-active-lead' )
				->rawParams( $this->getItemHtml( $outputPage, $qId, $itemLabel ) )
				->escaped();
			$detailKey = 'articleguidance-duplicate-active-detail';
		}
		$html = $this->getLead( $leadHtml );
		if ( count( $others ) === 1 ) {
			// Message keys: articleguidance-duplicate-active-detail-single,
			// articleguidance-duplicate-generic-active-detail-single
			$html .= Html::rawElement( 'p', [], $outputPage->msg( "$detailKey-single" )
				->rawParams( $this->linkRenderer->makeKnownLink( $others[0] ) )
				->escaped() );
		} else {
			// Message keys: articleguidance-duplicate-active-detail-multiple,
			// articleguidance-duplicate-generic-active-detail-multiple
			$html .= Html::rawElement( 'p', [], $outputPage->msg( "$detailKey-multiple" )
				->escaped() );
			$items = array_map(
				fn ( Title $other ) => Html::rawElement( 'li', [], $this->linkRenderer->makeKnownLink( $other ) ),
				$others
			);
			$html .= Html::rawElement( 'ul', [], implode( '', $items ) );
		}
		return Html::noticeBox( $html, 'ext-articleguidance-duplicate-notice' );
	}

	private function getLead( string $leadHtml ): string {
		return Html::rawElement( 'p', [], Html::rawElement( 'strong', [], $leadHtml ) );
	}

	/**
	 * Format an item as "label (Q-ID)", with the Q-ID linked to Wikidata.
	 *
	 * @param OutputPage $outputPage
	 * @param string $qId
	 * @param string|null $itemLabel Null for blobs stored before itemLabel was added
	 * @return string HTML
	 */
	private function getItemHtml( OutputPage $outputPage, string $qId, ?string $itemLabel ): string {
		$link = Html::element( 'a', [ 'href' => $this->wikidataUrls->getPageUrl( $qId ) ], $qId );
		if ( $itemLabel === null || $itemLabel === '' ) {
			return $link;
		}
		return $outputPage->msg( 'articleguidance-duplicate-item' )
			->plaintextParams( $itemLabel )
			->rawParams( $link )
			->escaped();
	}
}
