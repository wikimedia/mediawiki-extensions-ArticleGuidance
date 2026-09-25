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

	/**
	 * Marks the generic guidance outline, which is not linked to a Wikidata
	 * item (T435605). It is the value of the article-type tag attribute, and
	 * the value that identifies the outline where a Q ID is otherwise used.
	 */
	public const GENERIC_ARTICLE_TYPE = '*';

	/** Blob fields of an articleTypes entry that are not served */
	private const ITEM_FIELDS = [ 'itemLabel' => true, 'itemDescription' => true, 'itemImage' => true ];

	/** @var array{outlines: array, lastModified: string|null, claims: array<string,array<int,Title>>}|null */
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
	 * A generic outline has no Q-ID, so this method never returns one.
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
	 * Get the generic guidance outline, or null if the wiki has none.
	 *
	 * The generic outline has no Q ID, so getOutlineByQId() cannot find it.
	 * Callers that resolve an outline from a Q ID must come here instead when
	 * that Q ID is self::GENERIC_ARTICLE_TYPE.
	 *
	 * If the wiki has more than one, the oldest one wins (T424186).
	 *
	 * @return array|null
	 */
	public function getGenericOutline(): ?array {
		foreach ( $this->getOutlines() as $outline ) {
			if ( $outline['generic'] ) {
				return $outline;
			}
		}
		return null;
	}

	/**
	 * Find the other outlines that claim the same Wikidata items as a page.
	 *
	 * The page is a candidate with its own page ID and Q-IDs, so the result is
	 * correct before LinksUpdate stores its new page property.
	 *
	 * @param int $pageId Page being viewed
	 * @param string[] $qIds Q-IDs from the page's current ParserOutput, or
	 *   self::GENERIC_ARTICLE_TYPE for a generic outline
	 * @return array<string,array{owner:?Title,others:Title[]}> Keyed by Q-ID. The
	 *   owner is null when the page owns the Q-ID. The others are the remaining
	 *   outlines that claim it. Q-IDs that no other outline claims are left out.
	 */
	public function getDuplicates( int $pageId, array $qIds ): array {
		$claims = $this->getData()['claims'];
		$duplicates = [];
		foreach ( $qIds as $qId ) {
			$claimants = $claims[$qId] ?? [];
			unset( $claimants[$pageId] );
			if ( $claimants === [] ) {
				continue;
			}
			$ownerId = min( array_keys( $claimants ) );
			if ( $pageId < $ownerId ) {
				$duplicates[$qId] = [ 'owner' => null, 'others' => array_values( $claimants ) ];
			} else {
				$owner = $claimants[$ownerId];
				unset( $claimants[$ownerId] );
				$duplicates[$qId] = [ 'owner' => $owner, 'others' => array_values( $claimants ) ];
			}
		}
		return $duplicates;
	}

	/**
	 * Get the per-ID type list of an articleguidance-data blob.
	 *
	 * @param array $pageData Decoded articleguidance-data blob
	 * @return array[]
	 */
	public static function getArticleTypes( array $pageData ): array {
		// Synthesize the per-ID list for blobs persisted before multi-item
		// support (T421260), so consumers can rely on articleTypes. A generic
		// outline has neither key (T435605).
		return $pageData['articleTypes'] ?? ( isset( $pageData['articleType'] ) ? [ [
			'id' => $pageData['articleType'],
			'hierarchyDepth' => $pageData['hierarchyDepth'] ?? null,
			'matchVia' => $pageData['matchVia'] ?? null,
		] ] : [] );
	}

	/**
	 * Get the keys that an articleguidance-data blob claims.
	 *
	 * @param array $pageData Decoded articleguidance-data blob
	 * @return string[] The Q-IDs, or self::GENERIC_ARTICLE_TYPE for a generic outline
	 */
	public static function getClaimKeys( array $pageData ): array {
		// The generic outline claims the sentinel, so the uniqueness rule for
		// Q-IDs also applies to it
		if ( $pageData['generic'] ?? false ) {
			return [ self::GENERIC_ARTICLE_TYPE ];
		}
		return array_column( self::getArticleTypes( $pageData ), 'id' );
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
	 * @return array{outlines: array, lastModified: string|null, claims: array<string,array<int,Title>>}
	 */
	private function getData(): array {
		$this->cache ??= $this->fetchData();
		return $this->cache;
	}

	/**
	 * Fetch all outlines and the max page_touched timestamp from page props.
	 *
	 * When several outlines claim the same Q-ID, the outline with the lowest page ID
	 * (the oldest page) owns it. The other outlines lose that Q-ID, and outlines
	 * that lose all their Q-IDs are left out (T424186).
	 *
	 * @return array{outlines: array, lastModified: string|null, claims: array<string,array<int,Title>>}
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

		$pages = [];
		$claims = [];
		foreach ( $memberList as $member ) {
			$pageId = $member->getArticleID();
			if ( !isset( $propsById[$pageId] ) ) {
				continue;
			}
			$pageData = json_decode( $propsById[$pageId], true );
			if ( !is_array( $pageData ) ) {
				continue;
			}
			$pages[$pageId] = [ $member, $pageData ];
			foreach ( self::getClaimKeys( $pageData ) as $claimKey ) {
				$claims[$claimKey][$pageId] = $member;
			}
		}

		$outlines = [];
		foreach ( $pages as $pageId => [ $member, $pageData ] ) {
			$isOwner = static fn ( string $claimKey ) => min( array_keys( $claims[$claimKey] ) ) === $pageId;
			$isGeneric = (bool)( $pageData['generic'] ?? false );
			$allArticleTypes = self::getArticleTypes( $pageData );
			$articleTypes = array_values( array_filter(
				$allArticleTypes,
				static fn ( array $typeEntry ) => $isOwner( $typeEntry['id'] )
			) );
			if ( $isGeneric ? !$isOwner( self::GENERIC_ARTICLE_TYPE ) : $articleTypes === [] ) {
				continue;
			}
			$primary = $articleTypes[0] ?? null;
			if ( $primary !== null && array_key_exists( 'itemDescription', $primary ) ) {
				$description = $primary['itemDescription'];
				$image = $primary['itemImage'] ?? null;
			} elseif ( $primary === null || $primary['id'] === $allArticleTypes[0]['id'] ) {
				$description = $pageData['description'] ?? null;
				$image = $pageData['image'] ?? null;
			} else {
				// The top-level fields of an older blob describe an item that another
				// outline owns. Two outlines would show the same description and image.
				$description = null;
				$image = null;
			}
			// Capitalize the first letter at read time so labels persisted in
			// page_props before the capitalization fix (T427201) are corrected
			// without waiting for the pages to be re-parsed. The page title is
			// the last resort: a blob has no label only if it predates the
			// label key, and such a blob always has an article type. The title
			// keeps a blob with neither from getting an empty label.
			$label = $this->contentLanguage->ucfirst(
				$pageData['label'] ?? $primary['id'] ?? $member->getPrefixedText()
			);
			$outlines[] = [
				'title' => $member->getPrefixedText(),
				'label' => $label,
				'description' => $description ?? '',
				'articleTypes' => array_map(
					static fn ( array $typeEntry ) => array_diff_key( $typeEntry, self::ITEM_FIELDS ),
					$articleTypes
				),
				'generic' => $isGeneric,
				// The primary entry is also exposed through the pre-multi-item
				// singular fields, so JS bundles still cached from before the
				// deploy keep matching on it (T421260). TODO: Drop these three keys
				// together with the /v0 route once that window has passed.
				'articleType' => $primary['id'] ?? null,
				'hierarchyDepth' => $primary['hierarchyDepth'] ?? null,
				'matchVia' => $primary['matchVia'] ?? null,
				'instructions' => $pageData['instructions'] ?? null,
				'thumbnail' => $image,
				'notabilityRisk' => $pageData['notabilityRisk'] ?? [],
				'recommendedSources' => $pageData['recommendedSources'] ?? [],
				'discouragedSources' => $pageData['discouragedSources'] ?? [],
			];
		}

		return [ 'outlines' => $outlines, 'lastModified' => $lastModified, 'claims' => $claims ];
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
