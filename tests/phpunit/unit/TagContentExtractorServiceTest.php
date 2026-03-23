<?php

declare( strict_types = 1 );

namespace MediaWiki\Extension\ArticleGuidance\Tests\Unit;

use MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService;
use MediaWikiUnitTestCase;

/**
 * @covers \MediaWiki\Extension\ArticleGuidance\Services\TagContentExtractorService
 */
class TagContentExtractorServiceTest extends MediaWikiUnitTestCase {

	public function testExtractorsBasicInputOutput() {
		$input = <<<EOT
		<article-guidance article-type="Q515" notability-risk="wikidata">
		<instructions>
		Make sure you provide comprehensive coverage of the [[city]]'s geography,
		history, and demographics using reliable sources. [[Documentation]]
		</instructions>
		<recommended-sources>
		<info>Official government census data</info>
		<info>Academic studies on urban development</info>
		<info>Articles from reputable news organizations</info>
		</recommended-sources>
		<discouraged-sources>
		<info>Travel blogs</info>
		<info>Real estate advertisements</info>
		<info>Unverified online forums</info>
		</discouraged-sources>
		</article-guidance>
		EOT;

		$service = new TagContentExtractorService();
		$instructions = $service->extractInstructions( $input );
		$recommended = $service->extractSources( $input, 'recommended-sources' );
		$discouraged = $service->extractSources( $input, 'discouraged-sources' );

		$this->assertSame(
			"Make sure you provide comprehensive coverage of the [[city]]'s geography,\n"
			. "history, and demographics using reliable sources. [[Documentation]]",
			$instructions );
		$this->assertSame( [
			[
				'Official government census data',
				'Academic studies on urban development',
				'Articles from reputable news organizations',
			],
			[],
		], $recommended );
		$this->assertSame( [
			[
				'Travel blogs',
				'Real estate advertisements',
				'Unverified online forums',
			],
			[],
		], $discouraged );
	}

	public function testExtractorsNoDiscouragedSources() {
		$inputNoDiscouraged = <<<EOT
		<article-guidance article-type="Q571" notability-risk="sources wikidata">
		<instructions>
		Ensure the book meets Wikipedia's [[WP:NBOOK|notability guidelines for books]].
		Use reliable secondary sources for criticism and reception. Avoid excessive plot
		detail per [[WP:PLOTSUM]]. [[Documentation]]
		</instructions>
		<recommended-sources>
		<info>Reviews in major literary journals (e.g., The New York Review of Books)</info>
		<info>Academic analyses or citations</info>
		<info>Coverage in national newspapers</info>
		</recommended-sources>
		</article-guidance>
		EOT;

		$service = new TagContentExtractorService();
		$instructions = $service->extractInstructions( $inputNoDiscouraged );
		$recommended = $service->extractSources( $inputNoDiscouraged, 'recommended-sources' );
		$discouraged = $service->extractSources( $inputNoDiscouraged, 'discouraged-sources' );

		$this->assertSame(
			"Ensure the book meets Wikipedia's [[WP:NBOOK|notability guidelines for books]].\n"
			. "Use reliable secondary sources for criticism and reception. Avoid excessive plot\n"
			. "detail per [[WP:PLOTSUM]]. [[Documentation]]",
			$instructions );
		$this->assertSame( [
			[
				'Reviews in major literary journals (e.g., The New York Review of Books)',
				'Academic analyses or citations',
				'Coverage in national newspapers',
			],
			[],
		], $recommended );
		$this->assertSame( [ [], [] ], $discouraged );
	}

	public function testExtractorsNoSources() {
		$inputNoSources = <<<EOT
		<article-guidance article-type="Q515" notability-risk="wikidata">
		<instructions>
		Make sure you provide comprehensive coverage of the [[city]]'s geography,
		history, and demographics using reliable sources. [[Documentation]]
		</instructions>
		</article-guidance>
		EOT;

		$service = new TagContentExtractorService();
		$instructions = $service->extractInstructions( $inputNoSources );
		$recommended = $service->extractSources( $inputNoSources, 'recommended-sources' );
		$discouraged = $service->extractSources( $inputNoSources, 'discouraged-sources' );

		$this->assertSame(
			"Make sure you provide comprehensive coverage of the [[city]]'s geography,\n"
			. "history, and demographics using reliable sources. [[Documentation]]",
			$instructions );
		$this->assertSame( [ [], [] ], $recommended );
		$this->assertSame( [ [], [] ], $discouraged );
	}

	public function testExtractSourcesWithSourceTags() {
		$input = <<<EOT
		<article-guidance article-type="Q515" notability-risk="wikidata">
		<instructions>
		Make sure you provide comprehensive coverage of the [[city]]'s geography,
		history, and demographics using reliable sources. [[Documentation]]
		</instructions>
		<recommended-sources>
		<info>Official government census data</info>
		<info>Academic studies on urban development</info>
		<info>Articles from reputable news organizations</info>
		<source>https://journals.sagepub.com/home/usj</source>
		</recommended-sources>
		<discouraged-sources>
		<info>Travel blogs</info>
		<info>Real estate advertisements</info>
		<info>Unverified online forums</info>
		</discouraged-sources>
		</article-guidance>
		EOT;

		$service = new TagContentExtractorService();
		$recommended = $service->extractSources( $input, 'recommended-sources' );
		$this->assertSame( [
			[
				'Official government census data',
				'Academic studies on urban development',
				'Articles from reputable news organizations',
			],
			[
				'https://journals.sagepub.com/home/usj',
			],
		], $recommended );
	}
}
