# Instrumentation

ArticleGuidance uses [Test Kitchen](https://www.mediawiki.org/wiki/Test_Kitchen) for A/B
experiments and funnel analytics, both controlled by `ArticleGuidanceExperimentName`. When set
to a non-empty experiment name, only users assigned to the `treatment` group are redirected to
`Special:NewArticle`; all others follow the default wiki behaviour.

Exposure is recorded just before the group assignment is checked, so it fires for both treatment
and control users.

Funnel events are sent for every user who reaches `Special:NewArticle`, enabling drop-off
analysis across wizard steps. Each session shares a `funnel_entry_token` stored in
`sessionStorage` under `ArticleGuidanceFunnelToken`, scoped to the browser tab.

## Event catalog

| `action` | Trigger | `action_source` | `action_subtype` | `action_context` |
|---|---|---|---|---|
| `init` | `Special:NewArticle` wizard is ready | `redlink`, `articlewizard`, or `direct` | — | `{"title":"<article title>"}` |
| `write_title` | Debounced Wikidata search fires (query ≥ 1 character) | — | — | `{"query":"<search query>","result_count":<n>}` |
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
| `editing_start` | User lands on the editor: treatment group after completing the AG workflow, or control group following a red link directly | — | — | `{"page":{"title":"<title>"}}` |
| `article_saved` | User saves the first revision of a new article (fires for all groups, not only AG-workflow participants) | — | — | `{"page":{"title":"<title>","id":<id>}}` |
