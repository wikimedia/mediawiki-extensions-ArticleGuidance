# Instrumentation

ArticleGuidance uses a [Test Kitchen](https://www.mediawiki.org/wiki/Test_Kitchen) instrument for
funnel analytics, named by `ArticleGuidanceInstrumentName`. An empty name disables logging.

A wiki that does not have the feature sends no event at all: `ArticleGuidanceInstrumentFactory`
returns no instrument while `ArticleGuidanceEnabled` is false, and the client-side modules that
log events are never loaded.

The instrument does not control who is redirected to `Special:NewArticle`. That is controlled by
`ArticleGuidanceRedirectEnabled`; see [red-link-redirect.md](red-link-redirect.md).

An `entry_point` event is sent for every eligible user who clicks an in-scope red link, whether or
not the redirect is enabled. These events are the funnel denominator.

Funnel events are sent for every user who reaches `Special:NewArticle`, enabling drop-off
analysis across wizard steps. Each session shares a `funnel_entry_token` stored in
`sessionStorage` under `ArticleGuidanceFunnelToken`, scoped to the browser tab.

## Event catalog

| `action` | Trigger | `action_source` | `action_subtype` | `action_context` |
|---|---|---|---|---|
| `entry_point` | Eligible user clicks an in-scope red link | `redlink` | — | `{"redirected":<bool>}` |
| `init` | `Special:NewArticle` wizard is ready | `redlink`, `articlewizard`, or `direct` | — | `{"title":"<article title>"}` |
| `write_title` | Debounced Wikidata search fires (query ≥ 1 character) | — | — | `{"query":"<search query>","result_count":<n>,"path":"<wikidata_direct|mint_fallback_success|mint_fallback_no_results|wikidata_and_mint>","duration":<n>}` |
| `select_topic` | User clicks a Wikidata result card | — | `suggested_topic` | `{"result_qid":"<QID>","outline":{…}}` [see below](#how-an-outline-is-reported) |
| `select_topic` | User picks an outline from the browse-by-type panel, or picks "Other" there | — | `manual_topic` | `{"outline":{…}}` [see below](#how-an-outline-is-reported) (`matched_qid` always null) |
| `select_topic` | User clicks "Continue anyway" on the search step, which replaces the browse-by-type link when the wiki has no types | — | `continue_generic` | `{"outline":{…}}` [see below](#how-an-outline-is-reported) (`qids` always `["*"]`, `matched_qid` always null) |
| `add_source` | Source URL validated by the `/articleguidance/v0/source/validate` API | — | `valid` or `invalid` | `{"url":"<url>","domain":"<domain>","classification":"<classification>","mandatory":<bool>}` |
| `notability_action` | User clicks an option on the notability step | — | `wikidata_item`, `sandbox`, or `learn` | — |
| `notability_check_shown` | Notability step is shown | — | — | `{"tags":["<tag>",…]}` |
| `guidance_shown` | Instructions step is shown | — | — | — |
| `write_start` | User clicks "Start Writing" | — | — | `{"outline":{…}}` [see below](#how-an-outline-is-reported) |
| `subject_covered_shown` | Subject-covered step is shown | — | — | — |
| `subject_covered_action` | User acts on the subject-covered step | — | `improve`, `read`, or `create_redirect` | — |
| `redirect_created` | A redirect creation attempt finishes | — | `success` or `error` | `{"code":"<action API error code>"}` on error |
| `title_conflict_shown` | Title-conflict step is shown | — | — | — |
| `title_conflict_action` | User acts on the title-conflict step | — | `continue`, `use_suggestion`, or `view_existing` | — |
| `editing_start` | User lands on the editor: after completing the AG workflow, or by following a red link while the redirect is off | — | — | `{"page":{"title":"<title>"}}` |
| `article_saved` | User saves the first revision of a new article (fires for every new article, not only for AG-workflow participants;  redirects are excluded, they are covered by `redirect_created`) | — | — | `{"page":{"title":"<title>","id":<id>}}` |

## How an outline is reported

`select_topic` and `write_start` describe the outline the same way.

| Field | Meaning |
|-------|---------|
| `qids` | Every Wikidata Q ID the outline is linked to. None of them is privileged, so do not read the first as an identity. `["*"]` for the generic guidance outline, empty when there is no outline. |
| `matched_qid` | The Q ID the subject matched. Null when no match chose the outline: the user browsed to it, or it is the generic fallback. Always one of `qids` when set. |
| `title` | The outline's page title. This is its real identity, and it joins the events of one session. |

The two Q ID fields answer different questions. `qids` says which outline the user got;
`matched_qid` says which type the subject was recognised as. They coincide only for an
outline linked to a single Q ID.

### The generic guidance outline

Every wiki has a generic outline: its own, or the default one (T437432). A result that
matches no outline continues as `suggested_topic` with `qids` of `["*"]`, and
`unsupported_topic`, `unsupported_subject_shown` and `unsupported_subject_action` are no
longer sent. A time series that crosses the deploy therefore shows a step. Count
`unsupported_topic` and `suggested_topic` together to compare across it.

The default outline's `title` is `MediaWiki:Articleguidance-default-outline-preload` on
every wiki. Use it to tell the default apart from a wiki's own generic outline.
