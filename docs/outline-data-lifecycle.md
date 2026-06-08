# Outline Data Lifecycle

## Storage

Outline data is populated when a wiki page containing an `<article-guidance>` tag is saved or
re-parsed. The `ArticleGuidanceTagHandler` processes the tag and:

1. Fetches entity metadata (label, description, image, hierarchy depth, match-via) from Wikidata
   via `WikidataInfoFetcher`, which caches results for one week. An optional `label` attribute on
   the tag overrides the Wikidata-derived label everywhere — both the stored outline list and the
   on-wiki guidance card.
2. Parses the tag's inner content into fully-resolved HTML using `Parser::recursiveTagParseFully()`,
   resolving all strip markers (links, etc.) inline.
3. Writes the structured outline data as a page property (`articleguidance-data`) via
   `ParserOutput::setPageProperty()`. The property is written to the `page_props` database table
   by `LinksUpdate` after the save completes, making it persistent across parser cache expiry and
   server restarts.

Storage only occurs on full saves, not previews.

## Serving

The `/articleguidance/v0/outlines` REST endpoint calls `OutlineService::getOutlines()`, which:

1. Gets category members via a single database query on `categorylinks`.
2. Batch-loads the `articleguidance-data` property for all members in a single `page_props` query
   via `PageProps::getProperties()`.
3. JSON-decodes each value and assembles the outlines list. Pages with no property (not yet saved
   since deploy) are omitted.

The result is memoized on the service instance, so `getLastModified()` (called by the framework
for 304 checking) and `getOutlines()` (called in `execute()`) share the same two DB queries within
a single request.

## HTTP caching

The endpoint sets `Cache-Control: public, s-maxage=300`, allowing CDNs to cache responses for
5 minutes. It also implements `Last-Modified` via a `MAX(page_touched)` query across category
members, enabling 304 Not Modified responses for clients that send `If-Modified-Since`.

## Rendering on-wiki

The tag handler also passes the metadata to `ArticleGuidanceRenderer`, which produces the HTML
displayed inline on the outline page. This runs on every parse, independently of the above.
Notability thresholds (e.g. the crosswiki sitelink count) are read from wiki config at render time
and are not stored in the page property.
