# Outline Data Lifecycle

## Storage

Outline data is populated when a wiki page containing an `<article-guidance>` tag is saved or
re-parsed. The `ArticleGuidanceTagHandler` processes the tag and:

1. Fetches entity metadata (label, description, image, hierarchy depth, match-via) from Wikidata
   via `WikidataInfoFetcher`, which caches results for one week. The `article-type` attribute
   accepts one or more whitespace-separated Q IDs (T421260); entity metadata is fetched per ID.
   The first (primary) ID supplies the label, description and image, while every ID keeps its own
   hierarchy depth and match-via in an `articleTypes` array of `{ id, hierarchyDepth, matchVia }`
   entries. A singular `articleType` field holding the primary ID is also written, solely so a
   rollback to pre-multi-item code keeps working; runtime consumers use `articleTypes`. If any
   token in the attribute is malformed, the whole attribute is treated as invalid. An optional
   `label` attribute on the tag overrides the Wikidata-derived label everywhere — in the stored
   outline list, and on the on-wiki guidance card, where it replaces the primary item's label.
2. Parses the tag's inner content into fully-resolved HTML using `Parser::recursiveTagParseFully()`,
   resolving all strip markers (links, etc.) inline.
3. Writes the structured outline data as a page property (`articleguidance-data`) via
   `ParserOutput::setPageProperty()`. The property is written to the `page_props` database table
   by `LinksUpdate` after the save completes, making it persistent across parser cache expiry and
   server restarts.

Storage only occurs on full saves, not previews.

## Serving

The `/articleguidance/v1/outlines` REST endpoint calls `OutlineService::getOutlines()`, which:

1. Gets category members via a single database query on `categorylinks`.
2. Batch-loads the `articleguidance-data` property for all members in a single `page_props` query
   via `PageProps::getProperties()`.
3. JSON-decodes each value and assembles the outlines list. Pages with no property (not yet saved
   since deploy) are omitted. Blobs persisted before multi-item support get an `articleTypes`
   array synthesized from their legacy singular fields at read time. This is the only place the
   page property is read, so the synthesis happens exactly once and all consumers can rely on
   `articleTypes`. The primary entry is additionally served under the singular `articleType`,
   `hierarchyDepth` and `matchVia` keys, for JS still cached from before multi-item support.

The result is memoized on the service instance, so `getLastModified()` and `getETag()` (called by
the framework for conditional-request checking) and `getOutlines()` (called in `execute()`) share
the same two DB queries within a single request.

## HTTP caching

The endpoint sets `Cache-Control: public, s-maxage=300, max-age=0, must-revalidate`. CDNs cache
responses for 5 minutes. `s-maxage` applies to shared caches only, so it gives a browser no
freshness lifetime, and the browser would then compute one from `Last-Modified` and send no
conditional request. `max-age=0` and `must-revalidate` remove that lifetime, so a browser
revalidates on every request.

Freshness uses two validators:

- **`ETag`** — a SHA-1 of the JSON payload. The value is derived from the bytes that the response
  contains, so it changes whenever the response changes. This includes changes that no page edit
  causes: a `refreshLinks` run that rewrites `page_props`, a new response shape, or a message or
  config change. `If-None-Match` takes precedence over `If-Modified-Since` (RFC 9110), so this is
  the authoritative validator.
- **`Last-Modified`** — `MAX(page_touched)` across category members. It stays as metadata and for
  clients that send only `If-Modified-Since`. It cannot be the only validator, because
  `page_touched` does not move when `page_props` changes without an edit.

A **breaking** change to the response shape still needs a path version bump (`v1` → `v2`), because
JS bundles cached across the deploy expect the old shape. Keep the previous path registered for one
release, or those bundles 404. Additive and data-only changes no longer need a bump, because the
ETag already changes with them. The version currently in use is `v1`; `v0` remains only for the
bundle-compat reason, alongside the singular `articleType`/`hierarchyDepth`/`matchVia` keys, and
both can be dropped in a later release.

## Rendering on-wiki

The tag handler also passes the metadata to `ArticleGuidanceRenderer`, which produces the HTML
displayed inline on the outline page. This runs on every parse, independently of the above.
Notability thresholds (e.g. the crosswiki sitelink count) are read from wiki config at render time
and are not stored in the page property.
