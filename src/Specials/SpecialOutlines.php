<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Specials;

use MediaWiki\Config\Config;
use MediaWiki\Extension\ArticleGuidance\Services\CommonsThumb;
use MediaWiki\Extension\ArticleGuidance\Services\OutlinePageNamer;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataInfoFetcher;
use MediaWiki\Extension\ArticleGuidance\Services\WikidataUrls;
use MediaWiki\Html\Html;
use MediaWiki\SpecialPage\SpecialPage;
use MediaWiki\Title\TitleFactory;
use Wikimedia\Minify\CSSMin;

/**
 * Special:Outlines lists the outlines of the wiki, and the article types from
 * ArticleGuidanceSuggestedArticleTypes that do not have an outline yet.
 * Special:Outlines/<Q IDs> is the outline builder, which drafts a new outline
 * for one or more article types. Special:Outlines/* shows the default generic
 * guidance, when the wiki has no generic outline.
 */
class SpecialOutlines extends SpecialPage {

	/**
	 * Widths of the card thumbnails: standard Commons thumbnail widths, at about
	 * twice the shown size for high-density screens
	 */
	private const THUMBNAIL_WIDTH = 120;
	private const LARGE_THUMBNAIL_WIDTH = 250;

	public function __construct(
		private readonly OutlineService $outlineService,
		private readonly WikidataUrls $wikidataUrls,
		private readonly WikidataInfoFetcher $wikidataInfoFetcher,
		private readonly TitleFactory $titleFactory,
		private readonly Config $config,
		private readonly OutlinePageNamer $outlinePageNamer,
	) {
		parent::__construct( 'Outlines' );
	}

	/**
	 * @param string|null $subPage
	 */
	public function execute( $subPage ) {
		$this->setHeaders();

		$subPage = $subPage !== null ? trim( $subPage ) : '';
		if ( $subPage === OutlineService::GENERIC_ARTICLE_TYPE ) {
			$this->showGenericOutline();
			return;
		}
		if ( $subPage !== '' ) {
			$this->launchOutlineBuilder( $subPage );
			return;
		}

		// The summary describes the list below, so it is printed only for the
		// list view. The outline builder returns before this point.
		$this->outputHeader( 'outlines-summary' );

		$out = $this->getOutput();
		$out->addModuleStyles( [ 'ext.articleguidance.outlines.styles' ] );
		$out->addModules( [ 'ext.articleguidance.outlines' ] );

		$definedTypes = [];
		$outlineCards = [];
		$genericOutline = null;
		foreach ( $this->outlineService->getOutlines() as $outline ) {
			if ( $outline['generic'] ) {
				$genericOutline = $outline;
				continue;
			}
			foreach ( $outline['articleTypes'] as $typeEntry ) {
				$definedTypes[$typeEntry['id']] = true;
			}
			// Taint-check cannot tell the keys of an outline apart. Only the instructions
			// and source lists hold parsed HTML. The card escapes the label and the
			// description, which are plain text, so they are not escaped twice.
			// @phan-suppress-next-line SecurityCheck-DoubleEscaped
			$outlineCards[] = $this->buildOutlineCard( $outline );
		}

		$suggestedTypes = $this->config->get( 'ArticleGuidanceSuggestedArticleTypes' );
		$missing = [];
		foreach ( $suggestedTypes as $qId ) {
			if ( !isset( $definedTypes[$qId] ) ) {
				$missing[] = $qId;
			}
		}

		// Batched wbgetentities requests fill the missing cards' label, description and
		// thumbnail. The heavier match-via and hierarchy-depth inference waits until a
		// builder opens (Special:Outlines/<Q IDs>).
		// Core's SpecialPageFatalTest runs this page and fails on any HTTP request.
		// The cards then show Q IDs.
		$missingInfo = defined( 'MW_PHPUNIT_TEST' )
			? []
			: $this->wikidataInfoFetcher->fetchBasicEntities( $missing, $this->getLanguage()->getCode() );
		// getOutlines() always has a generic outline. The default one has no page,
		// so the wiki has not customized it yet.
		$genericCustomized = !( $genericOutline['default'] ?? false );

		$suggestedCards = [];
		foreach ( $missing as $qId ) {
			$suggestedCards[] = $this->buildSuggestedCard( $qId, $missingInfo[$qId] ?? [] );
		}
		$genericCard = $genericCustomized
			? $this->renderCustomizedGenericCard( $genericOutline )
			: $this->renderDefaultGenericCard();

		$outlineCount = count( $outlineCards ) + ( $genericCustomized ? 1 : 0 );
		if ( $outlineCount > 0 ) {
			$out->addHTML( $this->renderSection(
				$this->msg( 'articleguidance-outlines-heading' )->numParams( $outlineCount )->text(),
				'',
				$outlineCards,
				$genericCustomized ? $genericCard : ''
			) );
		}
		$suggestedCount = count( $suggestedCards ) + ( $genericCustomized ? 0 : 1 );
		if ( $suggestedCount > 0 ) {
			// The generic outline is a suggestion too, so it counts in the coverage
			$suggestedTotal = count( $suggestedTypes ) + 1;
			$out->addHTML( $this->renderSection(
				$this->msg( 'articleguidance-outlines-suggested-heading' )->numParams( $suggestedCount )->text(),
				$this->msg( 'articleguidance-outlines-suggested-subtext' )
					->numParams( $suggestedTotal - $suggestedCount, $suggestedTotal )
					->text(),
				$suggestedCards,
				$genericCustomized ? '' : $genericCard
			) );
		}

		$out->addHTML(
			Html::element( 'h2', [], $this->msg( 'articleguidance-outlines-custom-heading' )->text() ) .
			Html::element(
				'p',
				[ 'class' => 'mw-articleguidance-outlines__subtext' ],
				$this->msg( 'articleguidance-outlines-custom-subtext' )->text()
			) .
			// The ext.articleguidance.outlines module replaces the content with a search
			Html::rawElement(
				'div',
				[ 'id' => 'mw-articleguidance-outlines-custom' ],
				Html::element(
					'p',
					[ 'class' => 'mw-articleguidance-outlines__nojs' ],
					$this->msg( 'articleguidance-outlines-custom-nojs' )->text()
				)
			)
		);
	}

	/**
	 * @param string $heading Plain-text heading
	 * @param string $subtext Plain-text intro under the heading (empty to omit)
	 * @param array[] $cards Cards from buildOutlineCard() or buildSuggestedCard()
	 * @param string $lastCardHtml HTML of a card to show after the sorted cards (empty to omit)
	 * @return string HTML
	 */
	private function renderSection( string $heading, string $subtext, array $cards, string $lastCardHtml ): string {
		usort( $cards, static fn ( array $a, array $b ): int => strcasecmp( $a['sortKey'], $b['sortKey'] ) );

		$html = Html::element( 'h2', [], $heading );
		if ( $subtext !== '' ) {
			$html .= Html::element( 'p', [ 'class' => 'mw-articleguidance-outlines__subtext' ], $subtext );
		}
		return $html . Html::rawElement(
			'div',
			[ 'class' => 'mw-articleguidance-outlines__grid' ],
			implode( '', array_column( $cards, 'html' ) ) . $lastCardHtml
		);
	}

	/**
	 * Show the article types of the new outline, and mount the outline builder Vue
	 * app, which drafts the outline while the maintainer reads the details.
	 *
	 * @param string $subPage Comma-separated Wikidata Q IDs. The first is the primary type.
	 */
	private function launchOutlineBuilder( string $subPage ): void {
		$out = $this->getOutput();

		$qIds = OutlineService::parseArticleTypes( $subPage );
		if ( $qIds === [] ) {
			$out->addHTML( Html::errorBox(
				$this->msg( 'articleguidance-outlinebuilder-invalid-types' )->parse()
			) );
			return;
		}

		$entities = $this->wikidataInfoFetcher->fetchEntitiesCached( $qIds, $this->getLanguage()->getCode() );
		$types = [];
		$cards = '';
		foreach ( $qIds as $qId ) {
			$entity = $entities[$qId] ?? [];
			$label = (string)( $entity['label'] ?? '' );
			// matchVia and hierarchyDepth are inferred here (from ArticleGuidanceMatchViaRules,
			// via WikidataInfoFetcher) so the client can reproduce the search feature's
			// specificity ranking without re-inferring the strategy itself.
			$types[] = [
				'id' => $qId,
				'label' => $label,
				'matchVia' => $entity['matchVia'] ?? null,
				'hierarchyDepth' => $entity['hierarchyDepth'] ?? 0,
			];
			$cards .= $this->renderCard(
				(string)( $entity['image'] ?? '' ),
				$label !== '' ? $label : $qId,
				(string)( $entity['description'] ?? '' ),
				null,
				true,
				[],
				$this->renderWikidataLink( $qId )
			);
		}

		$labels = array_map(
			static fn ( array $type ): string => $type['label'] !== '' ? $type['label'] : $type['id'],
			$types
		);
		$out->setPageTitle( $this->msg( 'articleguidance-outlinebuilder-title' )
			->params( $this->getLanguage()->commaList( $labels ), $this->getLanguage()->commaList( $qIds ) )
			->text() );

		$prefix = rtrim( trim( $this->config->get( 'ArticleGuidanceOutlinePagePrefix' ) ), '/' );
		$out->addModuleStyles( [ 'ext.articleguidance.outlines.styles' ] );
		$out->addModules( [ 'ext.articleguidance.outlinebuilder' ] );
		$out->addHTML(
			Html::rawElement( 'div', [ 'class' => 'mw-articleguidance-outlines__types' ], $cards ) .
			Html::element( 'div', [
				'id' => 'ext-articleguidance-outlinebuilder',
				'data-types' => json_encode( $types ),
				'data-page-prefix' => $prefix,
				'data-page-name' => $this->getDefaultPageName( $types[0], $prefix ),
			] )
		);
	}

	/**
	 * Show the default generic guidance, with a link to start the wiki's own
	 * generic outline from it. When the wiki has a generic outline, go to its page.
	 */
	private function showGenericOutline(): void {
		$out = $this->getOutput();
		$genericOutline = $this->outlineService->getGenericOutline();
		if ( !( $genericOutline['default'] ?? false ) ) {
			$pageTitle = $this->titleFactory->newFromText( $genericOutline['title'] );
			if ( $pageTitle ) {
				$out->redirect( $pageTitle->getFullURL() );
				return;
			}
		}

		$out->setPageTitle( $this->msg( 'articleguidance-outlines-generic-label' )->text() );
		$out->addModuleStyles( [ 'ext.articleguidance.outlines.styles', 'ext.articleguidance.tag.styles' ] );

		$html = Html::element(
			'p',
			[ 'class' => 'mw-articleguidance-outlines__subtext' ],
			$this->msg( 'articleguidance-outlines-generic-default-intro' )->text()
		);
		// The page name is for the wiki's editors, so it is in the content language
		$genericLabel = $this->msg( 'articleguidance-outlines-generic-label' )->inContentLanguage()->text();
		$outlineTitle = $this->outlinePageNamer->getFreeTitles( [
			OutlineService::GENERIC_ARTICLE_TYPE => [
				$genericLabel,
				"$genericLabel (" . OutlineService::GENERIC_ARTICLE_TYPE . ')',
			],
		] )[OutlineService::GENERIC_ARTICLE_TYPE] ?? null;
		if ( $outlineTitle ) {
			$html .= Html::element( 'a', [
				'href' => $outlineTitle->getLocalURL( [
					'action' => 'edit',
					'preload' => $this->getPageTitle( OutlineService::GENERIC_ARTICLE_TYPE )->getPrefixedText(),
				] ),
				'class' => [
					'cdx-button',
					'cdx-button--fake-button',
					'cdx-button--fake-button--enabled',
					'cdx-button--action-progressive',
					'cdx-button--weight-primary',
				],
			], $this->msg( 'articleguidance-outlines-generic-customize' )->text() );
		}
		$out->addHTML( $html );
		// Parse the guidance as an outline page, so it looks the same
		$out->addHTML( $out->parseAsContent( $this->outlineService->getDefaultGenericOutlineWikitext() ) );
	}

	/**
	 * @param array{id: string, label: string} $primary Primary article type of the outline
	 * @param string $prefix Outline page prefix, without the trailing slash
	 * @return string Subpage name of a free outline page, or empty if no name is free
	 */
	private function getDefaultPageName( array $primary, string $prefix ): string {
		// The page name is for the wiki's editors, so it is in the content language
		$contentLanguage = $this->getContentLanguage()->getCode();
		$label = $contentLanguage === $this->getLanguage()->getCode()
			? $primary['label']
			: (string)( $this->wikidataInfoFetcher->fetchBasicEntities(
				[ $primary['id'] ], $contentLanguage
			)[$primary['id']]['label'] ?? '' );
		$outlineTitle = $this->outlinePageNamer->getFreeTitles(
			[ $primary['id'] => OutlinePageNamer::getNamesForType( $primary['id'], $label ) ]
		)[$primary['id']] ?? null;
		if ( !$outlineTitle ) {
			return '';
		}
		$fullName = $outlineTitle->getPrefixedText();
		$prefixTitle = $this->titleFactory->newFromText( $prefix );
		return $prefixTitle ? substr( $fullName, strlen( $prefixTitle->getPrefixedText() ) + 1 ) : $fullName;
	}

	/**
	 * @param array $outline Outline from OutlineService::getOutlines()
	 * @return array{sortKey: string, html: string}
	 */
	private function buildOutlineCard( array $outline ): array {
		$label = (string)$outline['label'];
		$pageTitle = $this->titleFactory->newFromText( $outline['title'] );

		return [
			'sortKey' => $label,
			'html' => $this->renderCard(
				(string)( $outline['thumbnail'] ?? '' ),
				$label,
				(string)( $outline['description'] ?? '' ),
				$pageTitle?->getLocalURL()
			),
		];
	}

	/**
	 * @param string $qId Suggested article type with no outline
	 * @param array $info Wikidata label, description, and image, if known
	 * @return array{sortKey: string, html: string}
	 */
	private function buildSuggestedCard( string $qId, array $info ): array {
		$label = self::getSuggestedLabel( $qId, $info );

		return [
			'sortKey' => $label,
			'html' => $this->renderCard(
				(string)( $info['image'] ?? '' ),
				$label,
				(string)( $info['description'] ?? '' ),
				$this->getPageTitle( $qId )->getLocalURL()
			),
		];
	}

	/**
	 * @param string $qId Suggested article type with no outline
	 * @param array $info Wikidata label, if known
	 * @return string Label to show, or the Q ID for an item with no label
	 */
	private static function getSuggestedLabel( string $qId, array $info ): string {
		$label = (string)( $info['label'] ?? '' );
		return $label !== '' ? $label : $qId;
	}

	/**
	 * The generic outline applies to all article types, so its card has a fixed
	 * label, description, and icon.
	 *
	 * @param array $outline The wiki's generic outline from OutlineService::getOutlines()
	 * @return string HTML
	 */
	private function renderCustomizedGenericCard( array $outline ): string {
		$pageTitle = $this->titleFactory->newFromText( $outline['title'] );

		return $this->renderCard(
			'',
			$this->msg( 'articleguidance-outlines-generic-label' )->text(),
			$this->msg( 'articleguidance-outlines-generic-description' )->text(),
			$pageTitle?->getLocalURL(),
			false,
			[ 'mw-articleguidance-outlines__card--generic' ]
		);
	}

	/**
	 * The wiki has no generic outline and uses the default generic guidance. The
	 * card links to Special:Outlines/*, which shows that guidance.
	 *
	 * @return string HTML
	 */
	private function renderDefaultGenericCard(): string {
		return $this->renderCard(
			'',
			$this->msg( 'articleguidance-outlines-generic-label' )->text(),
			$this->msg( 'articleguidance-outlines-generic-description' )->text(),
			$this->getPageTitle( OutlineService::GENERIC_ARTICLE_TYPE )->getLocalURL(),
			false,
			[ 'mw-articleguidance-outlines__card--generic' ]
		);
	}

	/**
	 * Build a Codex CSS-only card. A card with a URL is a link card.
	 *
	 * @param string $thumbnailUrl Image URL from CommonsThumb, or empty for a placeholder
	 * @param string $label Plain-text title
	 * @param string $description Plain-text description (empty to omit)
	 * @param string|null $url Link target of the card, or null for a card that is not a link
	 * @param bool $large Whether the card has a large thumbnail and all of its text
	 * @param string[] $extraClasses Additional CSS classes for the card
	 * @param string $metaHtml Pre-escaped HTML for the supporting text (empty to omit).
	 *   It must not hold a link if the card has a URL.
	 * @return string HTML
	 */
	private function renderCard(
		string $thumbnailUrl,
		string $label,
		string $description,
		?string $url,
		bool $large = false,
		array $extraClasses = [],
		string $metaHtml = ''
	): string {
		if ( $thumbnailUrl !== '' ) {
			$width = $large ? self::LARGE_THUMBNAIL_WIDTH : self::THUMBNAIL_WIDTH;
			$thumbnail = Html::element( 'span', [
				'class' => 'cdx-thumbnail__image',
				'style' => 'background-image: ' .
					CSSMin::buildUrlValue( CommonsThumb::resize( $thumbnailUrl, $width ) ) . ';',
			] );
		} else {
			$thumbnail = Html::rawElement(
				'span',
				[ 'class' => 'cdx-thumbnail__placeholder' ],
				Html::element( 'span', [ 'class' => 'cdx-thumbnail__placeholder__icon' ] )
			);
		}

		$text = Html::element( 'span', [ 'class' => 'cdx-card__text__title' ], $label );
		if ( $description !== '' ) {
			$text .= Html::element( 'span', [ 'class' => 'cdx-card__text__description' ], $description );
		}
		if ( $metaHtml !== '' ) {
			$text .= Html::rawElement( 'span', [ 'class' => 'cdx-card__text__supporting-text' ], $metaHtml );
		}

		$attributes = [
			'class' => [
				'cdx-card',
				'cdx-card--thumbnail-size-large',
				'mw-articleguidance-outlines__card',
				$large ? 'mw-articleguidance-outlines__card--large' : null,
				$url !== null ? 'cdx-card--is-link' : null,
				...$extraClasses,
			],
		];
		if ( $url !== null ) {
			$attributes['href'] = $url;
		}
		return Html::rawElement(
			$url !== null ? 'a' : 'div',
			$attributes,
			Html::rawElement( 'span', [ 'class' => 'cdx-thumbnail cdx-card__thumbnail' ], $thumbnail ) .
				Html::rawElement( 'span', [ 'class' => 'cdx-card__text' ], $text )
		);
	}

	/**
	 * Build a link to the Wikidata item for the given Q ID.
	 *
	 * @param string $qId
	 * @return string HTML
	 */
	private function renderWikidataLink( string $qId ): string {
		return Html::element(
			'a',
			[ 'href' => $this->wikidataUrls->getPageUrl( $qId ), 'target' => '_blank', 'rel' => 'noopener' ],
			$qId
		);
	}

	/**
	 * @return string
	 */
	protected function getGroupName() {
		return 'pages';
	}
}
