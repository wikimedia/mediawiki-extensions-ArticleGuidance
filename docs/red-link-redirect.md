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
2. **User scope** — the user is logged in, is not blocked, and has the `createpage` permission. When
   `ArticleGuidanceRedirectJuniorEditorsOnly` is true, the user must also have fewer edits than
   `ArticleGuidanceJuniorEditorThreshold` (default: 100).
3. **Referer scope** — the `Referer` HTTP header resolves to a page that is either listed in
   `ArticleGuidanceRedirectRefererTitles` or belongs to a category listed in
   `ArticleGuidanceRedirectRefererCategories`. If both lists are empty, all referers are in scope.
4. **Redirect enabled** — `ArticleGuidanceRedirectEnabled` is true and the user has not switched
   off the `articleguidance-enable` preference. The preference is on by default, and it is only
   shown when `ArticleGuidanceRedirectEnabled` is true.

When all conditions are met, the handler issues an HTTP redirect to
`Special:NewArticle?newarticletitle=<title>&source=redlink`, pre-filling the article title.

## Linking to Article Guidance

Red links are the only pages that redirect. A community that wants an explicit entry point links to
`Special:NewArticle` from its own page, for example from an article wizard. Add `?source=<name>` to
the link to identify the entry point in the analytics `init` event.
`Special:NewArticle?source=articlewizard` reports `articlewizard`; a link without the parameter
reports `direct`.

## Configuration

| Config key | Default | Description |
|---|---|---|
| `ArticleGuidanceRedirectEnabled` | `false` | Master switch for the redirect. |
| `ArticleGuidanceJuniorEditorThreshold` | `100` | Edit count below which a user is considered a junior editor. |
| `ArticleGuidanceRedirectJuniorEditorsOnly` | `false` | Restrict the redirect to junior editors. |
| `ArticleGuidanceRedirectRefererTitles` | `[]` | Pages whose red-links are in scope. Supports namespace prefixes. |
| `ArticleGuidanceRedirectRefererCategories` | `[]` | Categories (without `Category:` prefix) whose members' red-links are in scope. |

Analytics are configured separately, with `ArticleGuidanceInstrumentName`. See
[instrumentation.md](instrumentation.md).

## Referer matching

Title matching normalises both sides to DB keys (underscores, lowercase, namespace aliases) so
`Main Page` and `Main_Page` are treated identically. Category matching performs a live database
query (`getParentCategories()`) and is only executed when the title list produces no match.
Regardless of which rule matched, the analytics `source` param is always `redlink`.
