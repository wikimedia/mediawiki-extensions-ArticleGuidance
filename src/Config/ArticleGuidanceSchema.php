<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Config;

use MediaWiki\Config\Config;
use MediaWiki\Extension\CommunityConfiguration\Schema\JsonSchema;
use MediaWiki\MediaWikiServices;

// Each constant name is a MediaWiki config variable name, so it is not upper case.
// phpcs:disable Generic.NamingConventions.UpperCaseConstantName.ClassConstantNotUpperCase

/**
 * Schema of the Article Guidance settings that the community can change.
 *
 * The 'mw-config' provider makes each root property available as a MediaWiki config
 * variable of the same name. Article Guidance reads these variables through the
 * ArticleGuidanceConfig service, which uses Community Configuration when the
 * CommunityConfiguration extension is installed.
 *
 * The provider always applies a default to a variable that MediaWiki:ArticleGuidanceConfig.json
 * does not set. Each property therefore has a dynamic default that returns the site
 * configuration value, so that a wiki with no on-wiki page keeps the behaviour of its site
 * configuration. Keep the static default as well: Community Configuration reads it where a
 * dynamic default must not run.
 *
 * ArticleGuidanceUISchema groups these properties in the form. Add each new property
 * to a group there.
 */
class ArticleGuidanceSchema extends JsonSchema {

	public const VERSION = '1.0.0';

	public const UI_SCHEMA = ArticleGuidanceUISchema::class;

	public const ArticleGuidanceRedirectEnabled = [
		self::TYPE => self::TYPE_BOOLEAN,
		self::DEFAULT => false,
		self::DYNAMIC_DEFAULT => [ 'callback' => [ self::class, 'getRedirectEnabledDefault' ] ],
	];

	public const ArticleGuidanceRedirectJuniorEditorsOnly = [
		self::TYPE => self::TYPE_BOOLEAN,
		self::DEFAULT => false,
		self::DYNAMIC_DEFAULT => [
			'callback' => [ self::class, 'getRedirectJuniorEditorsOnlyDefault' ],
		],
	];

	/**
	 * Dynamic default of ArticleGuidanceRedirectEnabled.
	 */
	public static function getRedirectEnabledDefault(): bool {
		return (bool)self::getSiteConfig()->get( 'ArticleGuidanceRedirectEnabled' );
	}

	/**
	 * Dynamic default of ArticleGuidanceRedirectJuniorEditorsOnly.
	 */
	public static function getRedirectJuniorEditorsOnlyDefault(): bool {
		return (bool)self::getSiteConfig()->get( 'ArticleGuidanceRedirectJuniorEditorsOnly' );
	}

	/**
	 * A dynamic default runs inside a request, so the service container is available. The
	 * value must come from the site configuration, and not from the ArticleGuidanceConfig
	 * service, because that service asks the provider that asks for this default.
	 */
	private static function getSiteConfig(): Config {
		return MediaWikiServices::getInstance()->getMainConfig();
	}
}
