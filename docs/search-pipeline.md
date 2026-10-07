# Search and match pipeline

Article creation and subject search are scoped to the Main namespace. For a candidate's local-wiki sitelink, the namespace is resolved server-side (`getPageNamespaces` in `api/MediaWiki.js`) rather than parsed client-side, so it's correct regardless of the current interface language.

When a user types in the search box, `useWikidataSearch` debounces the input and fires the following requests in parallel:

1. **`searchWikidata`** hits the MediaWiki `action=query&list=search` API (backed by CirrusSearch on Wikidata.org, the same engine as the Wikidata website) and returns up to 12 candidate entities as Q-IDs. The search step shows 8; the extra candidates replace items that processing drops. The query excludes items whose direct P31 value is one of `wgArticleGuidanceExcludedItemTypes`, with one `-haswbstatement:P31=<Q-ID>` keyword per type. Subclasses of an excluded type are not excluded.
2. **`searchViaTranslation`** (only if the query contains a non-Latin script) preemptively translates the search query to a target language (like English) using MinT (`translateQuery`) and searches Wikidata with the translated query in the background.

Using CirrusSearch means queries like "Titanic film" match entities whose label is "Titanic" and whose description contains "film", mirroring the results users see on Wikidata.org.

`searchWikidata`, `translateQuery` and the existence check of the typed title (`useArticleExist`) keep page-scoped caches. When the user goes back to the search step, the step searches again, and the caches answer a query sent before without a new request. Failed requests are not cached. The existence cache is cleared when the workflow creates a redirect. A page that someone else creates in the meantime shows as missing until the page reloads.

## Processing Flow

Once the native Wikidata search completes, the native results are processed first:

1. **`fetchEntityClaims`** — a single `wbgetentities` call fetches the item-valued claims (P31, P106, P171, etc.), the image (P18), the sitelinks, and the labels and descriptions (in the user's language) for the candidate Q-IDs at once.
2. Items without a label in the user's language or its fallback languages are dropped.
3. Items whose local-wiki sitelink is outside the Main namespace are dropped.

Results keep the Wikidata search order. The search step shows the first 8.

## Translation Fallback

If the number of processed native results is less than 8 (`MAX_RESULT`), the translation fallback flow is executed:

1. We await the parallel `translationSearchPromise` results.
2. We de-duplicate translation results by filtering out candidates that were already present in the native Wikidata search results.
3. If there are new translation candidates, we process them separately through the same entity claims pipeline.
4. Finally, the processed native results are listed first, followed by the translation results.

## Matching the Selected Result

Outline matching runs only for the result that the user selects (T439877), because the SPARQL hierarchy query is slow. The search step shows a loading state until it finishes, then the workflow continues to the next step.

The loading state depends on the time since the selection:

* At once: a spinner and the message "Preparing guidance for …" (`articleguidance-specialnewarticle-matching-outline`). The loading state shows for at least 1 s, so that it does not flicker when matching is fast. An item that was matched before on the page matches instantly from the caches, so the minimum does not apply to it.
* At 10 s: matching stops, and the workflow continues with the generic outline. The 10 s include the wait for the outlines. The SPARQL requests are not cancelled. Their results go into the page-scoped cache.

The search step starts loading the outlines when it mounts, and the search does not wait for them. **`store.loadOutlines()`** fetches (or returns its cached copy of) the configured outlines from the local `/articleguidance/v1/outlines` REST endpoint. Each outline declares one or more article types in an `articleTypes` array, each entry a Wikidata Q-ID with an optional `matchVia` property (e.g. `P106` for occupations, `P171` for biological taxa, or defaulting to `P31` instance-of). The selection waits for the outlines first. If they fail to load, the search step shows its error state, because not even the generic outline is available.

`matchOutline` then matches the selected item:

1. If no outline declares an article type (only the generic outline exists), matching is skipped.
2. **`fetchEntityClaims`** and **`checkItemHierarchyMatches`** run in parallel. The SPARQL query uses the item's Q-ID as `VALUES ?item`, with one query per outline group, and traverses `wdt:P31/wdt:P279+` for default groups, `wdt:P106/wdt:P279+` for occupation groups and `wdt:P171+` for taxon groups. Both maintain page-scoped in-memory caches. The search already cached the selected item's claims, so matching makes no new `wbgetentities` request.
3. Zero-hop matches are resolved in JavaScript: the item is itself one of an outline's article-type Q-IDs, or a direct claim value is one. The SPARQL results (1+ hops only, since `+` is used rather than `*`) are merged in by `applyHierarchyMatches`.
4. `selectBestMatches` resolves ambiguity when the item matches multiple outlines: it first prefers outlines matched via a non-default `matchVia` strategy (preventing a broad type like Q5/human from drowning out a specific occupation match), then keeps only the highest-`hierarchyDepth` match, which corresponds to the most specific outline in the configured taxonomy.

When nothing matches, or matching fails, the workflow uses the generic guidance outline. The server always serves one: the wiki's own, or the default one (T437432). The `outline_matched` event reports the outline, the duration (outlines load and matching), and whether matching failed or timed out.

With `?debug=1`, the match is logged to the browser console.
