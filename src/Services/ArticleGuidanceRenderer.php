<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

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
	 * @param bool $notabilityRisk Whether to show notability warning
	 * @param string|null $instructionsHtml Parsed instructions HTML
	 * @param string|null $wikidataImage Image URL from Wikidata
	 * @return string Rendered HTML
	 */
	public function render(
		?string $wikidataId,
		?string $wikidataLabel,
		?string $wikidataDescription,
		?string $articleType,
		bool $notabilityRisk,
		?string $instructionsHtml,
		?string $wikidataImage = null
	): string {
		$isValid = $wikidataId !== null;

		// Build CSS classes
		$classes = [ 'ext-articleguidance' ];
		if ( !$isValid && $articleType !== null ) {
			$classes[] = 'ext-articleguidance-invalid';
		}

		$html = Html::openElement( 'div', [ 'class' => implode( ' ', $classes ) ] );

		// Image (if available) - displayed right-aligned
		if ( $wikidataImage ) {
			$html .= Html::element( 'img', [
				'src' => $wikidataImage,
				'class' => 'ext-articleguidance-image',
				'alt' => $wikidataLabel ?? ''
			] );
		}

		// Header
		$html .= Html::element( 'div', [ 'class' => 'ext-articleguidance-header' ],
			'Article Guidance'
		);

		// Article type information
		if ( $wikidataId ) {
			$typeHtml = Html::element( 'span', [ 'class' => 'ext-articleguidance-type-label' ],
				'Type: '
			);
			$typeHtml .= Html::element( 'a', [
				'href' => "https://www.wikidata.org/wiki/$wikidataId",
				'target' => '_blank',
			], $wikidataId );

			if ( $wikidataLabel ) {
				$label = Html::element( 'span', [], $wikidataLabel );
				$typeHtml .= ' ' . wfMessage( 'parentheses' )->rawParams( $label )->escaped();
			}

			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-type' ], $typeHtml );

			if ( $wikidataDescription ) {
				$html .= Html::element( 'div', [ 'class' => 'ext-articleguidance-description' ],
					$wikidataDescription
				);
			}
		} elseif ( $articleType !== null ) {
			$html .= Html::element( 'div', [ 'class' => 'ext-articleguidance-error' ],
				"Invalid article-type: '$articleType' (expected format: Q12345)"
			);
		}

		// Notability risk warning
		if ( $notabilityRisk ) {
			$html .= Html::element( 'div', [ 'class' => 'ext-articleguidance-risk-warning' ],
				'This article may have notability concerns'
			);
		}

		// Instructions content
		if ( $instructionsHtml !== null ) {
			$html .= Html::rawElement( 'div', [ 'class' => 'ext-articleguidance-content' ],
				$instructionsHtml
			);
		}

		$html .= Html::closeElement( 'div' );

		return $html;
	}
}
