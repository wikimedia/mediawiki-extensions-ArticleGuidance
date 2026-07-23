<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Hooks;

use MediaWiki\Config\Config;
use MediaWiki\Context\RequestContext;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineDraftStore;
use MediaWiki\Extension\ArticleGuidance\Services\OutlineService;
use MediaWiki\Hook\EditFormPreloadTextHook;
use MediaWiki\SpecialPage\SpecialPageFactory;
use MediaWiki\Title\TitleFactory;

/**
 * Preload an outline when a maintainer creates an outline page from
 * Special:Outlines: the draft that the browser generated, or an empty outline.
 * For the generic outline, it preloads the default generic guidance.
 *
 * The editor link has preload=Special:Outlines/<Q IDs>, or Special:Outlines/*
 * for the generic outline. VisualEditor sends only known parameters such as
 * preload to its API, so a custom parameter does not get to this hook.
 * A special page cannot have content, so core preloads nothing from it.
 */
class OutlinePreloadHandler implements EditFormPreloadTextHook {

	public function __construct(
		private readonly Config $config,
		private readonly TitleFactory $titleFactory,
		private readonly SpecialPageFactory $specialPageFactory,
		private readonly OutlineDraftStore $draftStore,
		private readonly OutlineService $outlineService,
	) {
	}

	/**
	 * @inheritDoc
	 */
	public function onEditFormPreloadText( &$text, $title ): void {
		// An explicit preload takes precedence
		if ( $text !== '' ) {
			return;
		}
		$context = RequestContext::getMain();
		$types = $this->getBuilderTypes( $context->getRequest()->getText( 'preload' ) );
		if ( $types === null ) {
			return;
		}
		$isGeneric = $types === OutlineService::GENERIC_ARTICLE_TYPE;
		$qIds = $isGeneric ? [] : OutlineService::parseArticleTypes( $types );
		if ( !$isGeneric && $qIds === [] ) {
			return;
		}
		// The parameter can only make outline pages, not add the tag to other pages
		$prefix = $this->titleFactory->newFromText(
			$this->config->get( 'ArticleGuidanceOutlinePagePrefix' )
		);
		if ( !$prefix
			|| $title->getNamespace() !== $prefix->getNamespace()
			|| !str_starts_with( $title->getDBkey(), $prefix->getDBkey() . '/' )
		) {
			return;
		}

		if ( $isGeneric ) {
			$text = $this->outlineService->getDefaultGenericOutlineWikitext();
			return;
		}
		$draft = $this->draftStore->get( $context->getUser(), $context->getRequest()->getSession(), $qIds );
		$text = $draft ?? self::buildSkeleton( $qIds );
	}

	/**
	 * @param string $preload Value of the preload parameter
	 * @return string|null Subpage of Special:Outlines, or null for another preload
	 */
	private function getBuilderTypes( string $preload ): ?string {
		$preloadTitle = $preload !== '' ? $this->titleFactory->newFromText( $preload ) : null;
		if ( !$preloadTitle || $preloadTitle->getNamespace() !== NS_SPECIAL ) {
			return null;
		}
		[ $name, $subPage ] = $this->specialPageFactory->resolveAlias( $preloadTitle->getDBkey() );
		return $name === 'Outlines' ? $subPage : null;
	}

	/**
	 * @param string[] $qIds Wikidata Q IDs of the article types. The first is the primary type.
	 * @return string Outline wikitext with the tag and its subtags, all empty
	 */
	public static function buildSkeleton( array $qIds ): string {
		return implode( "\n", [
			'<article-guidance article-type="' . implode( ' ', $qIds ) . '">',
			'',
			'<instructions>',
			'</instructions>',
			'',
			'<recommended-sources>',
			'</recommended-sources>',
			'',
			'<discouraged-sources>',
			'</discouraged-sources>',
			'',
			'</article-guidance>',
			'',
		] );
	}
}
