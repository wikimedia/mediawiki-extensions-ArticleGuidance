<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Config;

use MediaWiki\Extension\CommunityConfiguration\Schema\UISchema;

/**
 * Layout of the Article Guidance form on Special:CommunityConfiguration.
 *
 * The form shows the elements in the order of ROOT. A property of
 * ArticleGuidanceSchema that ROOT does not place still shows, but at the end and
 * outside all groups. Therefore, add each new property to a group here when you
 * add it to the data schema.
 *
 * Each group label is a message stem. The form makes the message keys
 * `communityconfiguration-articleguidance-<label>-section-label` and
 * `-section-description` from it.
 *
 * @see ArticleGuidanceSchema::UI_SCHEMA
 */
class ArticleGuidanceUISchema extends UISchema {

	public const ROOT = [
		self::ELEMENTS => [
			[
				self::TYPE => self::TYPE_GROUP,
				self::LABEL => 'feature',
				self::ELEMENTS => [
					'#/properties/ArticleGuidanceEnabled',
				],
			],
			[
				self::TYPE => self::TYPE_GROUP,
				self::LABEL => 'redirect',
				self::ELEMENTS => [
					'#/properties/ArticleGuidanceRedirectEnabled',
					'#/properties/ArticleGuidanceRedirectJuniorEditorsOnly',
				],
			],
		],
	];
}
