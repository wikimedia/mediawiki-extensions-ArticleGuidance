# Search and match pipeline

When a user types in the search box, `useWikidataSearch` debounces the input and fires two requests in parallel: `searchWikidata` hits the MediaWiki `action=query&list=search` API (backed by CirrusSearch on Wikidata.org, the same engine as the Wikidata website) and returns up to 20 candidate entities as Q-IDs, while `store.loadOutlines()` fetches (or returns its cached copy of) the configured outlines from the local `/articleguidance/v0/outlines` REST endpoint. Each outline declares an `articleType` (a Wikidata Q-ID) and an optional `matchVia` property (e.g. `P106` for occupations, `P171` for biological taxa, or defaulting to `P31` instance-of). Using CirrusSearch means queries like "Titanic film" match entities whose label is "Titanic" and whose description contains "film", mirroring the results users see on Wikidata.org.

Once both complete, the outlines are grouped by `matchVia`. Two more requests then fire in parallel:

- **`fetchEntityClaims`** — a single `wbgetentities` call that fetches the relevant claims (P31, P106, P171, P18, sitelinks, etc.) and the labels and descriptions (in the user's language) for all 20 candidate Q-IDs at once.
- **`checkItemHierarchyMatches`** — fires one SPARQL query per outline group against the Wikidata Query Service, all in parallel. Each query uses the candidate Q-IDs directly as `VALUES ?item` and traverses the appropriate property path: `wdt:P31/wdt:P279+` for default groups, `wdt:P106/wdt:P279+` for occupation groups, `wdt:P171+` for taxon groups, and `wdt:P31/wdt:P279*` for the configured excluded item types. Results are returned as an item-keyed map: `{ groupKey: { itemQId: Set<outlineQId> } }`.

Both `fetchEntityClaims` and `checkItemHierarchyMatches` maintain page-scoped in-memory caches (cleared on page reload). When a user types incrementally — "Albert" → "Albert E" → "Albert Einstein" — overlapping entities are served from cache, skipping the `wbgetentities` round-trip entirely for cached Q-IDs and skipping SPARQL for Q-IDs whose hierarchy results are already known.

Zero-hop matches are resolved from the `wbgetentities` data in JavaScript: if a candidate's Q-ID is itself an outline's `articleType`, or if its direct P31 value is an `articleType`, it is recorded without touching the SPARQL results. The SPARQL results (1+ hops only, since `+` is used rather than `*`) are then merged in by `applyHierarchyMatches`, which does a direct item→outline lookup from the item-keyed map.

Items are filtered out before matching if their P31 value is a configured excluded type (direct check via `wbgetentities`) or if the SPARQL exclusion query (`P31/wdt:P279*`) found a match.

Finally, `selectBestMatches` resolves ambiguity when a candidate matches multiple outlines: it first prefers outlines matched via a non-default `matchVia` strategy (preventing a broad type like Q5/human from drowning out a specific occupation match), then among survivors keeps only the highest-`hierarchyDepth` match, which corresponds to the most specific outline in the configured taxonomy.
