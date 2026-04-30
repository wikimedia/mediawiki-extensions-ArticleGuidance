<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Extension\ArticleGuidance\WikidataProperties;
use MediaWiki\Html\Html;

/**
 * Renders HTML for ext-articleguidance tag
 */
class ArticleGuidanceRenderer {

	/**
	 * Render the article guidance HTML
	 *
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
	 * @return string Rendered HTML
	 */
	public function render(
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
		?string $category = null
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
			'Article Guidance'
		);

		if ( $wikidataId ) {
			$typeHtml = Html::element( 'span', [ 'class' => 'ext-articleguidance-type-label' ],
				'Type: '
			);
			$linkAttrs = [
				'href' => "https://www.wikidata.org/wiki/$wikidataId",
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
				$typeHtml .= ' ' . wfMessage( 'parentheses' )->rawParams( $label )->escaped();
			}

			$topHtml .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-type' ], $typeHtml );

			if ( $wikidataDescription ) {
				$topHtml .= Html::element( 'div', [ 'class' => 'ext-articleguidance-description' ],
					$wikidataDescription
				);
			}
		} elseif ( $articleType !== null ) {
			$topHtml .= Html::element( 'div', [ 'class' => 'ext-articleguidance-error' ],
				"Invalid article-type: '$articleType' (expected format: Q12345)"
			);
		}

		$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-top' ], $topHtml );

		// --- Second region: notability restrictions/errors ---
		if ( $notabilityRisk !== [] || $invalidNotabilityRisk !== [] ) {
			$boxHtml = Html::element( 'div', [ 'class' => 'ext-articleguidance-restrictions-title' ],
				wfMessage( 'articleguidance-notability-restrictions-title' )->text()
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
						? wfMessage( 'articleguidance-notability-tag-' . $tag, $threshold )
						: wfMessage( 'articleguidance-notability-tag-' . $tag );
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
					wfMessage( 'articleguidance-notability-unknown-tags', $unknownList )->text()
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
						wfMessage( 'articleguidance-sources-tips-content-recommended' )->text()
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
						wfMessage( 'articleguidance-sources-tips-content-discouraged' )->text()
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
		if ( $category !== null ) {
			$html .= Html::element( 'hr', [ 'class' => 'ext-articleguidance-separator' ] );
			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-category' ],
				wfMessage( 'articleguidance-category-note',
					'[[:Category:' . $category . ']]'
				)->parse()
			);
		}

		$html .= Html::closeElement( 'div' );

		return $html;
	}
}
