# Outline Data Lifecycle

## Storage

Outline data is populated when a wiki page containing an `<article-guidance>` tag is saved or
re-parsed. The `ArticleGuidanceTagHandler` processes the tag and:

1. Fetches entity metadata (label, description, image, hierarchy depth, match-via) from Wikidata
   via `WikidataInfoFetcher`, which caches results for one week. The `article-type` attribute
   accepts one or more whitespace-separated Q IDs (T421260); entity metadata is fetched per ID.
   The first (primary) ID supplies the description and image, while every ID keeps its own
   hierarchy depth and match-via in an `articleTypes` array of
   `{ id, hierarchyDepth, matchVia, itemLabel, itemDescription, itemImage }` entries. The `item*`
   fields hold the Wikidata item's label, description and image in the content language. The
   duplicate notices use `itemLabel`, and duplicate resolution uses the description and image (see
   below). They are not served to the client. If any
   token in the attribute is malformed, the whole attribute is treated as invalid. The outline's
   label defaults to the last phrase of the outline page title (e.g. "Company" from
   `Article guidance/Company`), or can be overridden by an optional `label` attribute on the tag;
   the Wikidata item's label is not used for outline names. The outline label is used everywhere —
   in the stored outline list, and on the on-wiki guidance card for the primary item.
2. Parses the tag's inner content into fully-resolved HTML using `Parser::recursiveTagParseFully()`,
   resolving all strip markers (links, etc.) inline.
3. Writes the structured outline data as a page property (`articleguidance-data`) via
   `ParserOutput::setPageProperty()`. The property is written to the `page_props` database table
   by `LinksUpdate` after the save completes, making it persistent across parser cache expiry and
   server restarts.

Storage only occurs on full saves, not previews.

## The generic guidance outline

A wiki may have one outline that is linked to no Wikidata item (T435605), marked by
`article-type="*"`. The sentinel must stand alone: mixing it with Q IDs invalidates the
attribute. If a wiki has more than one, the oldest one is used and the others show a warning
(see [Duplicate resolution](#duplicate-resolution)).

Declaring no article types is what keeps this outline out of topic matching (T428152). The
workflow falls back to it when no other outline matches, at the point the user picks a
subject rather than while matching runs.

Having no Q ID of its own, it is addressed by the same `*` sentinel wherever an outline is
identified by Q ID. That is what lets it carry recommended and discouraged source lists
like any other outline, which suits the sources that are reliable or unreliable whatever
the subject is.

## Serving

The `/articleguidance/v1/outlines` REST endpoint calls `OutlineService::getOutlines()`, which:

1. Gets category members via a single database query on `categorylinks`.
2. Batch-loads the `articleguidance-data` property for all members in a single `page_props` query
   via `PageProps::getProperties()`.
3. JSON-decodes each value and assembles the outlines list. Pages with no property (not yet saved
   since deploy) are omitted. Blobs persisted before multi-item support get an `articleTypes`
   array synthesized from their legacy singular fields at read time by
   `OutlineService::getArticleTypes()`, so all consumers can rely on `articleTypes`.
4. Resolves duplicates (see [Duplicate resolution](#duplicate-resolution)), so each Q ID appears
   in at most one outline.

The result is memoized on the service instance, so `getLastModified()` and `getETag()` (called by
the framework for conditional-request checking) and `getOutlines()` (called in `execute()`) share
the same two DB queries within a single request.

## Duplicate resolution

Several outline pages can list the same Wikidata item (T424186). The outline page that was created
first (the lowest `page_id`) owns the item, and Article Guidance uses only that outline for it.

The rule applies to each Q ID separately. If outline A lists Q1 and Q2, and a newer outline B lists
Q2 and Q3, A owns Q1 and Q2 and B owns Q3. `OutlineService` removes the Q IDs that an outline does
not own from its `articleTypes`, and leaves out outlines that own none. The outline's description
and thumbnail come from the first Q ID that it still owns, so two outlines never show the same
item's description. A blob saved before the `item*` fields existed has only the primary item's
description and image; if another outline owns that item, the outline has no description or
thumbnail until it is re-parsed. So the REST payload,
`getOutlineByQId()` and the client all see one outline per Q ID. Only exact Q ID matches count as
duplicates. Hierarchy overlaps (for example an outline for Q5 and one matched via P106) are
handled by the client ranking, not here.

A generic outline claims the `*` sentinel in place of a Q ID, so the same rule applies to it: the
oldest generic outline is served, and newer ones are left out.

`DuplicateOutlineNoticeHandler` (an `OutputPageParserOutput` hook) shows a Codex message on an
outline page when other outlines claim its items: a notice on the owner, and a warning on an outline
that loses some or all of its items. The notices are added when the page is viewed, not by the tag
handler, because the parser cache does not change when another outline is edited or deleted. The
handler reads the page's Q IDs from its current `ParserOutput`, so the notice is correct right
after a save, before `LinksUpdate` writes `page_props`. Logged-out readers can see an old notice
until the CDN entry expires; editors are logged in and skip the CDN.

To fix a duplicate, remove the Q ID from one of the outlines, or merge the two outlines.

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
ETag already changes with them. The version currently in use is `v1`.

## Rendering on-wiki

The tag handler also passes the metadata to `ArticleGuidanceRenderer`, which produces the HTML
displayed inline on the outline page. This runs on every parse, independently of the above.
Notability thresholds (e.g. the crosswiki sitelink count) are read from wiki config at render time
and are not stored in the page property.
