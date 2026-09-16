# Red Link Redirect

When a user clicks a red link (a link to a non-existent article), the extension intercepts the
resulting edit request and redirects eligible users to `Special:NewArticle` instead of the standard
editor.

## How it works

The redirect is handled by `RedLinkRedirectHandler`, which implements the `BeforeInitialize` hook.
It fires early in the request lifecycle, before any output is generated, and works on both desktop
and mobile.

The handler first checks the global switch, `ArticleGuidanceEnabled`, through the
`FeatureState` service. When the wiki does not have the feature, the handler returns immediately
and every path below keeps the default wiki behaviour.

On each request, the handler then evaluates four independent conditions. All must be true for a
redirect to occur:

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
   shown when both `ArticleGuidanceEnabled` and `ArticleGuidanceRedirectEnabled` are true.

When all conditions are met, the handler issues an HTTP redirect to
`Special:NewArticle?newarticletitle=<title>&source=redlink`, pre-filling the article title.

## Linking to Article Guidance

Red links are the only pages that redirect. A community that wants an explicit entry point links to
`Special:NewArticle` from its own page, for example from an article wizard. Add `?source=<name>` to
the link to identify the entry point in the analytics `init` event.
`Special:NewArticle?source=articlewizard` reports `articlewizard`; a link without the parameter
reports `direct`.

## Configuration

Both `ArticleGuidanceEnabled` and `ArticleGuidanceRedirectEnabled` are available in Community
Configuration, so a community can change them without a deployment. The global switch has
precedence: when it is off, the redirect settings have no effect.

| Config key | Default | Description |
|---|---|---|
| `ArticleGuidanceEnabled` | `false` | Master switch for the whole feature. When false, the wiki behaves as if Article Guidance were not enabled. |
| `ArticleGuidanceRedirectEnabled` | `false` | Switch for the redirect. Has an effect only when `ArticleGuidanceEnabled` is true. |
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

## Creating a redirect instead of an article

When the chosen subject already has an article, the `subjectcovered` step offers
**Create a redirect** (T426844); `isRedirectOfferable()` holds the conditions. The
write is an ordinary `action=edit` with `createonly=1`, plus three details:

- `#REDIRECT` comes from the server (`wgArticleGuidanceRedirectWord`) because it is
  content-language and the client has only the interface language.
- No summary is sent; MediaWiki's `autoredircomment` supplies one.
- `articleguidance=1` marks the request for `EditTagHandler`, which otherwise sees
  only the `SESSION_EDITING` entry left by a page navigation. Any caller can set it.
