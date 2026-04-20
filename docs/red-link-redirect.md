# Red Link Redirect

When a user clicks a red link (a link to a non-existent article), the extension intercepts the
resulting edit request and redirects eligible users to `Special:NewArticle` instead of the standard
editor.

## How it works

The redirect is handled by `RedLinkRedirectHandler`, which implements the `BeforeInitialize` hook.
It fires early in the request lifecycle, before any output is generated, and works on both desktop
and mobile.

On each request, the handler evaluates four independent conditions. All must be true for a redirect
to occur:

1. **Red-link detection** — the target title does not exist, the `action` query parameter is
   `edit`, the `redlink` query parameter is `1`, and the title is in the main namespace.
2. **User scope** — the user is logged in, has fewer edits than `ArticleGuidanceJuniorEditorThreshold`
   (default: 100), is not blocked, and has the `createpage` permission.
3. **Referer scope** — the `Referer` HTTP header resolves to a page that is either listed in
   `ArticleGuidanceExperimentRefererTitles` or belongs to a category listed in
   `ArticleGuidanceExperimentRefererCategories`. If both lists are empty, all referers are in scope.
4. **Experiment group** — if `ArticleGuidanceExperimentName` is set and the TestKitchen extension
   is available, the user must be assigned to the `treatment` group. An empty experiment name
   disables A/B splitting and redirect all eligible traffic.

When all conditions are met, the handler issues an HTTP redirect to
`Special:NewArticle?newarticletitle=<title>&source=redlink`, pre-filling the article title.

## Entry-point redirect

In addition to red-link interception, the handler supports direct entry-point pages configured via
`ArticleGuidanceExperimentEntryPointTitles`. When a qualifying user (in scope and in the treatment
group) visits one of those pages, they are redirected to `Special:NewArticle?source=articlewizard`
without a pre-filled title. This path does not check the referer.

## Configuration

| Config key | Default | Description |
|---|---|---|
| `ArticleGuidanceJuniorEditorThreshold` | `100` | Edit count below which a user is considered a junior editor. |
| `ArticleGuidanceExperimentName` | `""` | TestKitchen experiment name. Empty string disables A/B splitting. |
| `ArticleGuidanceExperimentRefererTitles` | `["Main_Page"]` | Pages whose red-links are in scope. Supports namespace prefixes. |
| `ArticleGuidanceExperimentRefererCategories` | `[]` | Categories (without `Category:` prefix) whose members' red-links are in scope. |
| `ArticleGuidanceExperimentEntryPointTitles` | `[]` | Pages that act as direct entry points. Empty array disables this path. |

## Referer matching

Title matching normalises both sides to DB keys (underscores, lowercase, namespace aliases) so
`Main Page` and `Main_Page` are treated identically. Category matching performs a live database
query (`getParentCategories()`) and is only executed when the title list produces no match.
Regardless of which rule matched, the analytics `source` param is always `redlink`.
