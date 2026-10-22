# Instrumentation

ArticleGuidance uses a [Test Kitchen](https://www.mediawiki.org/wiki/Test_Kitchen) instrument for
funnel analytics, named by `ArticleGuidanceInstrumentName`. An empty name disables logging.

A wiki that does not have the feature sends no event at all: `ArticleGuidanceInstrumentFactory`
returns no instrument while `ArticleGuidanceEnabled` is false, and the client-side modules that
log events are never loaded.

The instrument does not control who is redirected to `Special:NewArticle`. That is controlled by
`ArticleGuidanceRedirectEnabled`; see [red-link-redirect.md](red-link-redirect.md).

Events are sent only for Article Guidance actions. A user who follows a red link to the editor
without going through Article Guidance, or who creates a page outside of Article Guidance, sends no
event.

Funnel events are sent for every user who reaches `Special:NewArticle`, enabling drop-off
analysis across wizard steps. Each session shares a `funnel_entry_token` stored in
`sessionStorage` under `ArticleGuidanceFunnelToken`, scoped to the browser tab.

## Event catalog

| `action` | Trigger | `action_source` | `action_subtype` | `action_context` |
|---|---|---|---|---|
| `entry_point` | Eligible user clicks an in-scope red link and is redirected to `Special:NewArticle` | `redlink` | — | — |
| `init` | `Special:NewArticle` wizard is ready | `redlink`, `articlewizard`, or `direct` | — | `{"title":"<article title>"}` |
| `search_start` | A title search request is sent, after the debounce | `redlink`, `articlewizard`, or `direct` | `mount` or `input` | `{"search_id":"<id>","query":"<search query>"}` [see below](#title-search-events) |
| `search_end` | A title search ends | `redlink`, `articlewizard`, or `direct` | `results`, `no_results`, `error`, `replaced`, or `cancelled` | `{"search_id":"<id>","query":"<search query>","duration":<ms>,"result_count":<n>,"path":"<wikidata_direct|mint_fallback_success|mint_fallback_no_results|wikidata_and_mint>"}` [see below](#title-search-events) |
| `visibility_change` | The page is hidden or shown again, on any step | `redlink`, `articlewizard`, or `direct` | `hidden` or `visible` | `{"step":"<step>","step_duration":<ms>}` [see below](#visits-and-drop-off) |
| `select_topic` | User clicks a Wikidata result card | — | `suggested_topic` | `{"result_qid":"<QID>"}` |
| `select_topic` | User picks an outline from the browse-by-type panel, or picks "Other" there | — | `manual_topic` | `{"outline":{…}}` [see below](#how-an-outline-is-reported) (`matched_qid` always null) |
| `select_topic` | User clicks "Continue anyway" on the search step, which replaces the browse-by-type link when the wiki has no types | — | `continue_generic` | `{"outline":{…}}` [see below](#how-an-outline-is-reported) (`qids` always `["*"]`, `matched_qid` always null) |
| `outline_matched` | Outline matching for the selected Wikidata result finishes | — | — | `{"result_qid":"<QID>","outline":{…},"duration":<ms>,"fallback":"<none|error|timeout>"}` (`duration` includes any wait for the outlines to load) [see below](#how-an-outline-is-reported) |
| `add_source` | Source URL validated by the `/articleguidance/v0/source/validate` API | — | `valid` or `invalid` | `{"url":"<url>","domain":"<domain>","classification":"<classification>","mandatory":<bool>}` |
| `notability_action` | User clicks an option on the notability step | — | `wikidata_item`, `sandbox`, or `learn` | — |
| `notability_check_shown` | Notability step is shown | — | — | `{"tags":["<tag>",…]}` |
| `guidance_shown` | Instructions step is shown | — | — | — |
| `write_start` | User clicks "Start Writing" | — | — | `{"outline":{…}}` [see below](#how-an-outline-is-reported) |
| `subject_covered_shown` | Subject-covered step is shown | — | — | — |
| `subject_covered_action` | User acts on the subject-covered step | — | `improve`, `read`, `create_redirect`, or `return` | — |
| `redirect_created` | A redirect creation attempt finishes | — | `success` or `error` | `{"code":"<action API error code>"}` on error |
| `title_conflict_shown` | Title-conflict step is shown | — | — | — |
| `title_conflict_action` | User acts on the title-conflict step | — | `continue`, `use_suggestion`, or `view_existing` | — |
| `editing_start` | User lands on the editor after completing the AG workflow | `articleguidance` | — | `{"page":{"title":"<title>"}}` |
| `article_saved` | User saves the first revision of a new article that they started in the AG workflow (redirects are excluded, they are covered by `redirect_created`) | `articleguidance` | — | `{"page":{"title":"<title>","id":<id>,"namespace_id":<ns>}}` |

## Title search events

`search_start` and `search_end` bracket one search. Typing and the 300 ms debounce are not
part of the search. Each `search_start` has one `search_end` with the same `search_id`,
unless the user leaves the page or the search step first.

`search_start.action_subtype` is the trigger:

| Trigger | Meaning |
|---------|---------|
| `mount` | The search step opens with a query: a prefilled title, or the user goes back to the step |
| `input` | The user edits the query |

`search_end.action_subtype` is the status:

| Status | Meaning |
|--------|---------|
| `results` | At least one result is shown |
| `no_results` | The search succeeded and no result is shown |
| `error` | The search failed |
| `replaced` | The user edited the query before the search ended. A newer search follows. |
| `cancelled` | The user cleared the query before the search ended |

`query` is the query that was searched, not the current input. `duration` is the time from
`search_start` until the status was known. `result_count` (at most 8) and `path` are only
set for `results` and `no_results`.

`search_end` replaces `write_title` (T439830, deploy date to be added). `write_title`
logged the current input as `query`, logged failed searches as zero results, and did not
log replaced searches.

## Visits and drop-off

`init` starts a visit. `visibility_change` is sent each time the page is hidden (tab switch,
app switch, page closed or left) and shown again. A visit can have several hidden/visible
pairs. The last `hidden` event marks where the user left. `step_duration` is the time since
the current step was shown.

To know the search state when the user left the search step, compare the last `hidden`
event with the last `search_start` and `search_end`: a `search_start` without its
`search_end` is a search that the user did not wait for.

## How an outline is reported

`select_topic`, `outline_matched` and `write_start` describe the outline the same way.

A Wikidata result is matched to an outline only after the user selects it (T439877). Its
`select_topic` event therefore has no outline; the `outline_matched` event that follows reports
it. `fallback` is `error` when matching failed, and `timeout` when it took longer than 10 s.
The generic outline is used in both cases.

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
matches no outline continues with `qids` of `["*"]` in `outline_matched`, and
`unsupported_topic`, `unsupported_subject_shown` and `unsupported_subject_action` are no
longer sent. A time series that crosses the deploy therefore shows a step. Count
`unsupported_topic` and `suggested_topic` together to compare across it.

The default outline's `title` is `MediaWiki:Articleguidance-default-outline-preload` on
every wiki. Use it to tell the default apart from a wiki's own generic outline.
