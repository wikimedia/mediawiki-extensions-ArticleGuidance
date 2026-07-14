<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Extension\ArticleGuidance\WikidataProperties;
use MediaWiki\Html\Html;
use MediaWiki\Language\Language;
use MediaWiki\Message\Message;

/**
 * Renders HTML for ext-articleguidance tag
 */
class ArticleGuidanceRenderer {

	/**
	 * @param WikidataUrls $wikidataUrls Builds Wikidata item page links.
	 */
	public function __construct(
		private readonly WikidataUrls $wikidataUrls,
	) {
	}

	/**
	 * Render the article guidance HTML
	 *
	 * @param Language $targetLanguage Parser target/content language for message localization
	 * @param string|null $wikidataId Wikidata Q ID
	 * @param string|null $wikidataLabel Label from Wikidata
	 * @param string|null $wikidataDescription Description from Wikidata
	 * @param string|null $articleType Raw article-type attribute (for error display)
	 * @param array $notabilityRisk Valid notability-risk tags
	 * @param array $invalidNotabilityRisk Unknown notability-risk tags
	 * @param string|null $instructionsHtml Parsed instructions HTML
	 * @param array|null $recommendedSourcesHtml List of recommended sources HTML
	 * @param array|null $discouragedSourcesHtml List of discouraged sources HTML
	 * @param string|null $wikidataImage Wikidata image URL
	 * @param array $notabilityThresholds Notability thresholds
	 * @param string|null $matchVia Match-via property for tooltip info
	 * @param string|null $categoryNoteHtml Pre-parsed category note HTML
	 * @return string Rendered HTML
	 */
	public function render(
		Language $targetLanguage,
		?string $wikidataId,
		?string $wikidataLabel,
		?string $wikidataDescription,
		?string $articleType,
		array $notabilityRisk,
		array $invalidNotabilityRisk,
		?string $instructionsHtml,
		?array $recommendedSourcesHtml,
		?array $discouragedSourcesHtml,
		?string $wikidataImage = null,
		array $notabilityThresholds = [],
		?string $matchVia = null,
		?string $categoryNoteHtml = null
	): string {
		$isValid = $wikidataId !== null;

		// Build CSS classes
		$classes = [ 'ext-articleguidance' ];
		if ( !$isValid && $articleType !== null ) {
			$classes[] = 'ext-articleguidance-invalid';
		}

		$html = Html::openElement( 'div', [ 'class' => implode( ' ', $classes ) ] );

		// --- Top region: image + identity info ---
		$topHtml = '';

		if ( $wikidataImage ) {
			$topHtml .= Html::element( 'img', [
				'src' => $wikidataImage,
				'class' => 'ext-articleguidance-image',
				'alt' => $wikidataLabel ?? ''
			] );
		}

		$topHtml .= Html::element( 'div', [ 'class' => 'ext-articleguidance-header' ],
			Message::newFromKey( 'articleguidance-header' )->inLanguage( $targetLanguage )->text()
		);

		if ( $wikidataId ) {
			$typeHtml = Html::element( 'span', [ 'class' => 'ext-articleguidance-type-label' ],
				Message::newFromKey( 'articleguidance-type-label' )->inLanguage( $targetLanguage )->text() . ' '
			);
			$linkAttrs = [
				'href' => $this->wikidataUrls->getPageUrl( $wikidataId ),
				'target' => '_blank',
			];
			if ( $matchVia !== null ) {
				$propName = WikidataProperties::PROPERTY_NAMES[$matchVia] ?? $matchVia;
				$linkAttrs['title'] = "match-via: $matchVia ($propName)";
			} else {
				$p31 = WikidataProperties::PROP_INSTANCE_OF;
				$p279 = WikidataProperties::PROP_SUBCLASS_OF;
				$p31Name = WikidataProperties::PROPERTY_NAMES[$p31];
				$p279Name = WikidataProperties::PROPERTY_NAMES[$p279];
				$linkAttrs['title'] = "match-via: default ($p31 $p31Name / $p279 $p279Name*)";
			}
			$typeHtml .= Html::element( 'a', $linkAttrs, $wikidataId );

			if ( $wikidataLabel ) {
				$label = Html::element( 'span', [], $wikidataLabel );
				$typeHtml .= ' ' . Message::newFromKey( 'parentheses' )
					->inLanguage( $targetLanguage )->rawParams( $label )->escaped();
			}

			$topHtml .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-type' ], $typeHtml );

			if ( $wikidataDescription ) {
				$topHtml .= Html::element( 'div', [ 'class' => 'ext-articleguidance-description' ],
					$wikidataDescription
				);
			}
		} elseif ( $articleType !== null ) {
			$topHtml .= Html::element( 'div', [ 'class' => 'ext-articleguidance-error' ],
				Message::newFromKey( 'articleguidance-invalid-article-type', $articleType )
					->inLanguage( $targetLanguage )->text()
			);
		}

		$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-top' ], $topHtml );

		// --- Second region: notability restrictions/errors ---
		if ( $notabilityRisk !== [] || $invalidNotabilityRisk !== [] ) {
			$boxHtml = Html::element( 'div', [ 'class' => 'ext-articleguidance-restrictions-title' ],
				Message::newFromKey( 'articleguidance-notability-restrictions-title' )
					->inLanguage( $targetLanguage )->text()
			);

			if ( $notabilityRisk !== [] ) {
				$listHtml = '';
				foreach ( $notabilityRisk as $tag ) {
					$badge = Html::element( 'span',
						[ 'class' => 'ext-articleguidance-restriction-tag' ],
						$tag
					);
					$threshold = $notabilityThresholds[$tag] ?? null;
					$msg = $threshold !== null
						? Message::newFromKey( 'articleguidance-notability-tag-' . $tag, $threshold )
						: Message::newFromKey( 'articleguidance-notability-tag-' . $tag );
					$msg->inLanguage( $targetLanguage );
					$desc = Html::element( 'span',
						[ 'class' => 'ext-articleguidance-restriction-desc' ],
						$msg->text()
					);
					$listHtml .= Html::rawElement( 'li',
						[ 'class' => 'ext-articleguidance-restriction-item' ],
						$badge . $desc
					);
				}
				$boxHtml .= Html::rawElement( 'ul',
					[ 'class' => 'ext-articleguidance-restrictions-list' ],
					$listHtml
				);
			}

			if ( $invalidNotabilityRisk !== [] ) {
				$unknownList = implode( ', ', $invalidNotabilityRisk );
				$boxHtml .= Html::element( 'div',
					[ 'class' => 'ext-articleguidance-restrictions-unknown' ],
					Message::newFromKey( 'articleguidance-notability-unknown-tags', $unknownList )
						->inLanguage( $targetLanguage )->text()
				);
			}

			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-restrictions' ], $boxHtml );
		}

		// Instructions content
		if ( $instructionsHtml !== null ) {
			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-content' ],
				$instructionsHtml
			);
		}

		// Recommended and discouraged sources
		if ( is_array( $recommendedSourcesHtml ) && count( $recommendedSourcesHtml ) === 2 ) {
			[ $infoHtmlArray, $urlsArray ] = $recommendedSourcesHtml;
			$allItems = array_merge( $infoHtmlArray ?? [], $urlsArray ?? [] );
			if ( count( $allItems ) > 0 ) {
				$listHtml = '';
				foreach ( $infoHtmlArray ?? [] as $item ) {
					$listHtml .= Html::rawElement( 'li', [], $item );
				}
				foreach ( $urlsArray ?? [] as $item ) {
					$listHtml .= Html::element( 'li', [], $item );
				}
				$html .= Html::rawElement(
					'div',
					[ 'class' => 'ext-articleguidance-sources-recommended' ],
					Html::element(
						'div',
						[ 'class' => 'ext-articleguidance-sources-title' ],
						Message::newFromKey( 'articleguidance-sources-tips-content-recommended' )
							->inLanguage( $targetLanguage )->text()
					 ) .
					Html::rawElement(
						'ul',
						[ 'class' => 'ext-articleguidance-sources-list' ],
						$listHtml
					 )
				);
			}
		}

		if ( is_array( $discouragedSourcesHtml ) && count( $discouragedSourcesHtml ) === 2 ) {
			[ $infoHtmlArray, $urlsArray ] = $discouragedSourcesHtml;
			$allItems = array_merge( $infoHtmlArray ?? [], $urlsArray ?? [] );
			if ( count( $allItems ) > 0 ) {
				$listHtml = '';
				foreach ( $infoHtmlArray ?? [] as $item ) {
					$listHtml .= Html::rawElement( 'li', [], $item );
				}
				foreach ( $urlsArray ?? [] as $item ) {
					$listHtml .= Html::element( 'li', [], $item );
				}
				$html .= Html::rawElement(
					'div',
					[ 'class' => 'ext-articleguidance-sources-discouraged' ],
					Html::element(
						'div',
						[ 'class' => 'ext-articleguidance-sources-title' ],
						Message::newFromKey( 'articleguidance-sources-tips-content-discouraged' )
							->inLanguage( $targetLanguage )->text()
					 ) .
					Html::rawElement(
						'ul',
						[ 'class' => 'ext-articleguidance-sources-list' ],
						$listHtml
					 )
				);
			}
		}

		// Category note — shown last, separated from the sources section
		if ( $categoryNoteHtml !== null ) {
			$html .= Html::element( 'hr', [ 'class' => 'ext-articleguidance-separator' ] );
			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-category' ],
				$categoryNoteHtml
			);
		}

		$html .= Html::closeElement( 'div' );

		return $html;
	}
}
