# Outline Data Lifecycle

## Storage

Outline data is populated when a wiki page containing an `<article-guidance>` tag is saved or
re-parsed. The `ArticleGuidanceTagHandler` processes the tag and:

1. Fetches entity metadata (label, description, image, hierarchy depth, match-via) from Wikidata
   via `WikidataInfoFetcher`, which caches results for 24 hours.
2. Parses the tag's inner content into fully-resolved HTML using `Parser::recursiveTagParseFully()`,
   resolving all strip markers (links, etc.) inline.
3. Writes the structured outline data to the `ParserOutput` extension data slot
   `ArticleGuidance:data` via `ParserOutput::setExtensionData()`. This data is stored as part of
   the normal parser cache and is automatically invalidated whenever the page is re-parsed or saved.
4. Touches the outlines WAN check key via `OutlineService::touchOutlinesCheckKey()`, which
   immediately invalidates the cached outlines list so the next API request sees fresh data.

Storage only occurs on full saves, not previews.

## Serving

The `/articleguidance/v0/outlines` REST endpoint calls `OutlineService::getOutlines()`, which:

1. Returns the result from the outlines WAN cache if valid (fast path).
2. On a cache miss (first request after save, or after a check key touch), fetches fresh data:
   - Gets category members via a single database query.
   - For each member page, reads its `ArticleGuidance:data` extension data slot from the parser
     cache via `ParserOutputAccess::getParserOutput()`. When the parser cache is warm (normal
     operation), this is a fast read. When cold, a fresh parse is triggered;
     `WikidataInfoFetcher`'s own cache keeps this fast.
   - Pages with no `ArticleGuidance:data` entry are omitted from the response.
3. Stores the result in the outlines WAN cache for up to 24 hours, subject to the check key.

## HTTP caching

The endpoint sets `Cache-Control: public, s-maxage=300`, allowing CDNs to cache responses for
5 minutes. It also implements `Last-Modified` via a `MAX(page_touched)` query across category
members, enabling 304 Not Modified responses for clients that send `If-Modified-Since`.

## Rendering on-wiki

The tag handler also passes the metadata to `ArticleGuidanceRenderer`, which produces the HTML
displayed inline on the outline page. This runs on every parse, independently of the above.
