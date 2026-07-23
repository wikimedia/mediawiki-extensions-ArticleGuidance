<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Services;

use MediaWiki\Language\Language;
use MediaWiki\Page\LinkBatchFactory;
use MediaWiki\Title\Title;
use MediaWiki\Title\TitleFactory;

/**
 * Chooses the page that a new outline is created on: "<prefix>/<Name>".
 */
class OutlinePageNamer {

	public function __construct(
		private readonly TitleFactory $titleFactory,
		private readonly LinkBatchFactory $linkBatchFactory,
		private readonly Language $contentLanguage,
		private readonly string $prefix,
	) {
	}

	/**
	 * Choose a free page for each new outline. A page that exists already can
	 * be an outline for another type, or a page that is not an outline, so the
	 * names after the first add the article type to make the name unique.
	 *
	 * @param array<string,string[]> $namesByType Subpage names to try, in order, by
	 *   Q ID or OutlineService::GENERIC_ARTICLE_TYPE
	 * @return array<string,Title> Free page by article type, for types that have one
	 */
	public function getFreeTitles( array $namesByType ): array {
		$options = [];
		foreach ( $namesByType as $type => $names ) {
			$options[$type] = array_filter( array_map( $this->makeTitle( ... ), $names ) );
		}
		// One query fills the link cache, so exists() below does not query again
		$this->linkBatchFactory->newLinkBatch( array_merge( [], ...array_values( $options ) ) )
			->setCaller( __METHOD__ )
			->execute();

		$titles = [];
		foreach ( $options as $type => $typeOptions ) {
			foreach ( $typeOptions as $title ) {
				if ( !$title->exists() ) {
					$titles[$type] = $title;
					break;
				}
			}
		}
		return $titles;
	}

	/**
	 * @param string $qId Wikidata Q ID of the article type
	 * @param string $label Label of the article type, or empty if it has none
	 * @return string[] Subpage names to try, in order, for getFreeTitles()
	 */
	public static function getNamesForType( string $qId, string $label ): array {
		// The Q ID is the last choice, for a label that makes no valid title
		return $label !== '' ? [ $label, "$label ($qId)", $qId ] : [ $qId ];
	}

	/**
	 * @param string $name Label or Q ID of the article type
	 * @return Title|null "<prefix>/<Name>", or null if it is not a valid title
	 */
	private function makeTitle( string $name ): ?Title {
		// Characters that are illegal in titles or that make a deeper subpage
		$subpage = trim( preg_replace( '/[\[\]{}|<>#\/\n\r]/', '', $name ) );
		if ( $subpage === '' ) {
			return null;
		}
		$prefix = rtrim( trim( $this->prefix ), '/' );
		// MediaWiki capitalizes the first letter of a title, but not of a subpage
		$subpage = $this->contentLanguage->ucfirst( $subpage );
		return $this->titleFactory->newFromText( $prefix === '' ? $subpage : "$prefix/$subpage" );
	}
}
