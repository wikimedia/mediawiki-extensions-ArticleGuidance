<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance;

/**
 * Wikidata property and entity ID constants used across the extension.
 */
class WikidataProperties {

	// Properties (P-IDs)

	/** P18 – image */
	public const PROP_IMAGE = 'P18';

	/** P31 – instance of */
	public const PROP_INSTANCE_OF = 'P31';

	/** P106 – occupation */
	public const PROP_OCCUPATION = 'P106';

	/** P171 – parent taxon */
	public const PROP_PARENT_TAXON = 'P171';

	/** P279 – subclass of */
	public const PROP_SUBCLASS_OF = 'P279';

	/** Human-readable names for known properties, keyed by property ID */
	public const PROPERTY_NAMES = [
		self::PROP_IMAGE => 'image',
		self::PROP_INSTANCE_OF => 'instance of',
		self::PROP_OCCUPATION => 'occupation',
		self::PROP_PARENT_TAXON => 'parent taxon',
		self::PROP_SUBCLASS_OF => 'subclass of',
	];

	/**
	 * Shape of a Wikidata item ID. Same rule as Wikibase's ItemId::PATTERN, which this
	 * extension cannot use because it does not depend on Wikibase. Lowercase "q" is
	 * not accepted.
	 */
	private const ITEM_ID_PATTERN = '/^Q[1-9]\d{0,9}\z/';

	/** Largest item number that Wikibase accepts (ItemId is an Int32EntityId) */
	private const MAX_ITEM_NUMBER = 2147483647;

	/**
	 * Whether a string is a Wikidata item ID that can exist, e.g. "Q42".
	 *
	 * Wikidata rejects a whole wbgetentities request when one of its IDs is
	 * "Q0", has leading zeros or is too large, so these must be refused before
	 * they reach a request.
	 *
	 * @param string $id
	 * @return bool
	 */
	public static function isItemId( string $id ): bool {
		return preg_match( self::ITEM_ID_PATTERN, $id ) === 1
			&& (int)substr( $id, 1 ) <= self::MAX_ITEM_NUMBER;
	}
}
