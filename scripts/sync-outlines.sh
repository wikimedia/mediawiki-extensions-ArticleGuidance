#!/usr/bin/env bash
# sync-outlines.sh — Upload ArticleGuidance outline pages to a MediaWiki wiki
# via the Action API using curl and jq.
#
# Usage:
#   bash scripts/sync-outlines.sh \
#     --url https://wiki.example.org \
#     --user Admin@SeedBot \
#     --password <bot-password> \
#     [--prefix "Wikipedia:Article guidance"] \
#     [--outlines-dir ./outlines] \
#     [--dry-run]

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
OUTLINES_DIR="./outlines"
PAGE_PREFIX="Wikipedia:Article guidance"
DRY_RUN=false
WIKI_URL=""
BOT_USER=""
BOT_PASSWORD=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --url)          WIKI_URL="$2";      shift 2 ;;
        --user)         BOT_USER="$2";      shift 2 ;;
        --password)     BOT_PASSWORD="$2";  shift 2 ;;
        --prefix)       PAGE_PREFIX="$2";   shift 2 ;;
        --outlines-dir) OUTLINES_DIR="$2";  shift 2 ;;
        --dry-run)      DRY_RUN=true;       shift   ;;
        *)
            echo "Unknown argument: $1" >&2
            echo "Usage: $0 --url <url> --user <user> --password <password> [--prefix <prefix>] [--outlines-dir <dir>] [--dry-run]" >&2
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Validate required arguments
# ---------------------------------------------------------------------------
missing=()
[[ -z "$WIKI_URL"     ]] && missing+=(--url)
[[ -z "$BOT_USER"     ]] && missing+=(--user)
[[ -z "$BOT_PASSWORD" ]] && missing+=(--password)

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: missing required arguments: ${missing[*]}" >&2
    exit 1
fi

# Strip trailing slash from URL
WIKI_URL="${WIKI_URL%/}"
API_URL="${WIKI_URL}/w/api.php"

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install it with: brew install jq  (macOS) or apt-get install jq (Debian/Ubuntu)" >&2
    exit 1
fi

if ! command -v curl &>/dev/null; then
    echo "Error: curl is required but not installed." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Validate outlines directory
# ---------------------------------------------------------------------------
if [[ ! -d "$OUTLINES_DIR" ]]; then
    echo "Error: outlines directory not found: $OUTLINES_DIR" >&2
    exit 1
fi

shopt -s nullglob
outline_files=("$OUTLINES_DIR"/*.txt)
shopt -u nullglob

if [[ ${#outline_files[@]} -eq 0 ]]; then
    echo "Error: no .txt files found in $OUTLINES_DIR" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Would upload the following pages to $WIKI_URL:"
    for file in "${outline_files[@]}"; do
        name="$(basename "$file" .txt)"
        echo "  ${PAGE_PREFIX}/${name}  ←  ${file}"
    done
    exit 0
fi

# ---------------------------------------------------------------------------
# Cookie jar (session persistence across requests)
# ---------------------------------------------------------------------------
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# ---------------------------------------------------------------------------
# Step 1: Fetch login token
# ---------------------------------------------------------------------------
echo "Fetching login token…"
login_token_response="$(
    curl -s \
        --cookie-jar "$COOKIE_JAR" \
        --cookie "$COOKIE_JAR" \
        --get \
        --data-urlencode "action=query" \
        --data-urlencode "meta=tokens" \
        --data-urlencode "type=login" \
        --data-urlencode "format=json" \
        "$API_URL"
)"

login_token="$(echo "$login_token_response" | jq -r '.query.tokens.logintoken')"

if [[ -z "$login_token" || "$login_token" == "null" ]]; then
    echo "Error: could not retrieve login token." >&2
    echo "$login_token_response" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Log in
# ---------------------------------------------------------------------------
echo "Logging in as ${BOT_USER}…"
login_response="$(
    curl -s \
        --cookie-jar "$COOKIE_JAR" \
        --cookie "$COOKIE_JAR" \
        --request POST \
        --data-urlencode "action=login" \
        --data-urlencode "lgname=${BOT_USER}" \
        --data-urlencode "lgpassword=${BOT_PASSWORD}" \
        --data-urlencode "lgtoken=${login_token}" \
        --data-urlencode "format=json" \
        "$API_URL"
)"

login_result="$(echo "$login_response" | jq -r '.login.result')"

if [[ "$login_result" != "Success" ]]; then
    echo "Error: login failed (result: ${login_result})." >&2
    echo "$login_response" >&2
    exit 1
fi

echo "Login successful."

# ---------------------------------------------------------------------------
# Step 3: Fetch CSRF token
# ---------------------------------------------------------------------------
echo "Fetching CSRF token…"
csrf_response="$(
    curl -s \
        --cookie-jar "$COOKIE_JAR" \
        --cookie "$COOKIE_JAR" \
        --get \
        --data-urlencode "action=query" \
        --data-urlencode "meta=tokens" \
        --data-urlencode "format=json" \
        "$API_URL"
)"

csrf_token="$(echo "$csrf_response" | jq -r '.query.tokens.csrftoken')"

if [[ -z "$csrf_token" || "$csrf_token" == "null" ]]; then
    echo "Error: could not retrieve CSRF token." >&2
    echo "$csrf_response" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Upload each outline file
# ---------------------------------------------------------------------------
success_count=0
failure_count=0

for file in "${outline_files[@]}"; do
    name="$(basename "$file" .txt)"
    title="${PAGE_PREFIX}/${name}"

    echo "Uploading: ${title}…"

    edit_response="$(
        curl -s \
            --cookie-jar "$COOKIE_JAR" \
            --cookie "$COOKIE_JAR" \
            --request POST \
            --form "action=edit" \
            --form "title=${title}" \
            --form "text=<${file}" \
            --form "summary=Seed outline page via sync-outlines.sh" \
            --form "token=${csrf_token}" \
            --form "format=json" \
            "$API_URL"
    )"

    edit_result="$(echo "$edit_response" | jq -r '.edit.result // "Error"')"

    if [[ "$edit_result" == "Success" ]]; then
        new_revid="$(echo "$edit_response" | jq -r '.edit.newrevid // "—"')"
        nochange="$(echo "$edit_response" | jq -r '.edit.nochange // false')"
        if [[ "$nochange" == "true" ]]; then
            echo "  ✓ ${title} — no change (page already up to date)"
        else
            echo "  ✓ ${title} — saved (revid: ${new_revid})"
        fi
        (( success_count++ )) || true
    else
        error_info="$(echo "$edit_response" | jq -r '.error | "\(.code): \(.info)"' 2>/dev/null || echo "$edit_response")"
        echo "  ✗ ${title} — FAILED: ${error_info}" >&2
        (( failure_count++ )) || true
    fi
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Done. ${success_count} page(s) uploaded successfully, ${failure_count} failed."

if [[ $failure_count -gt 0 ]]; then
    exit 1
fi
