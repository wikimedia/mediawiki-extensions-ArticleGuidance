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
}
