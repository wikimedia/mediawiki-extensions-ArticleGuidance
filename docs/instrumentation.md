# Instrumentation

ArticleGuidance uses a [Test Kitchen](https://www.mediawiki.org/wiki/Test_Kitchen) instrument for
funnel analytics, named by `ArticleGuidanceInstrumentName`. An empty name disables logging.

The instrument does not control who is redirected to `Special:NewArticle`. That is controlled by
`ArticleGuidanceRedirectEnabled`; see [red-link-redirect.md](red-link-redirect.md).

An `entry_point` event is sent for every eligible user who clicks an in-scope red link or lands on
a configured entry point, whether or not the redirect is enabled. These events are the funnel
denominator.

Funnel events are sent for every user who reaches `Special:NewArticle`, enabling drop-off
analysis across wizard steps. Each session shares a `funnel_entry_token` stored in
`sessionStorage` under `ArticleGuidanceFunnelToken`, scoped to the browser tab.

## Event catalog

| `action` | Trigger | `action_source` | `action_subtype` | `action_context` |
|---|---|---|---|---|
| `entry_point` | Eligible user clicks an in-scope red link, or lands on a configured entry point | `redlink` or `articlewizard` | — | `{"redirected":<bool>}` |
| `init` | `Special:NewArticle` wizard is ready | `redlink`, `articlewizard`, or `direct` | — | `{"title":"<article title>"}` |
| `write_title` | Debounced Wikidata search fires (query ≥ 1 character) | — | — | `{"query":"<search query>","result_count":<n>,"path":"<wikidata_direct|mint_fallback_success|mint_fallback_no_results|wikidata_and_mint>","duration":<n>}` |
| `select_topic` | User clicks a Wikidata result card | — | `suggested_topic` | `{"result_qid":"<QID>","outline":{"title":"<outline name>","qid":"<QID>"}}` |
| `select_topic` | User picks an outline from the browse-by-type panel | — | `manual_topic` | `{"title":"<outline name>","qid":"<QID>"}` |
| `add_source` | Source URL validated by the `/articleguidance/v0/source/validate` API | — | `valid` or `invalid` | `{"url":"<url>","domain":"<domain>","classification":"<classification>","mandatory":<bool>}` |
| `notability_action` | User clicks an option on the notability step | — | `wikidata_item`, `sandbox`, or `learn` | — |
| `notability_check_shown` | Notability step is shown | — | — | `{"tags":["<tag>",…]}` |
| `guidance_shown` | Instructions step is shown | — | — | — |
| `write_start` | User clicks "Start Writing" | — | — | `{"title":"<outline name>","qid":"<QID>"}` |
| `subject_covered_shown` | Subject-covered step is shown | — | — | — |
| `subject_covered_action` | User acts on the subject-covered step | — | `improve` or `read` | — |
| `title_conflict_shown` | Title-conflict step is shown | — | — | — |
| `title_conflict_action` | User acts on the title-conflict step | — | `continue`, `use_suggestion`, or `view_existing` | — |
| `unsupported_subject_shown` | Unsupported-subject step is shown | — | — | — |
| `unsupported_subject_action` | User acts on the unsupported-subject step | — | `request_support` or `start_writing` | — |
| `editing_start` | User lands on the editor: after completing the AG workflow, or by following a red link while the redirect is off | — | — | `{"page":{"title":"<title>"}}` |
| `article_saved` | User saves the first revision of a new article (fires for every new article, not only for AG-workflow participants) | — | — | `{"page":{"title":"<title>","id":<id>}}` |
