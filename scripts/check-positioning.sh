#!/bin/sh
#
# check-positioning.sh - VirtualSMS positioning and number drift guard.
#
# Fails if any tracked, human-authored file in this repo contains copy that
# contradicts the canonical brand values (stale service/country counts, banned
# framing, infrastructure or supplier leaks, em/en dashes).
#
# Canonical source of truth: Vault/Design/canonical.json
#
# Usage:  sh scripts/check-positioning.sh
#
# Exit codes:
#   0  clean
#   1  banned copy found
#   2  harness error (not a git repo, missing rules file, unknown rule type)
#   3  the vendored canon is OUT OF SYNC with the Vault, or was hand-edited
#
# THIS SCRIPT CONTAINS NO BANNED STRINGS AND NO BRAND VALUES. It is a dumb
# interpreter. Every pattern it matches is read at runtime from
# scripts/positioning-rules.txt, which is GENERATED from scripts/canonical.json,
# which is a byte-for-byte copy of Vault/Design/canonical.json.
#
# WHY IT IS BUILT THIS WAY
#   Until 2026-07-17 this script HARDCODED every banned string and cited the
#   Vault only in a comment. That made the guard itself a hand-typed copy of
#   canon that nobody re-derived, which is the exact defect it exists to catch:
#   adding an entry to canonical.json's avoid[] enforced NOTHING. The strings now
#   come from canon, and the sync check below makes a stale copy loud instead of
#   silent. Vault/Design/sync-canonical.js is the ONLY sanctioned writer of the
#   two generated files. Do not hand-edit them; the rules-sha256 check will catch
#   it, which is the same defect returning by the back door.
#
# Design notes:
#   - Scans TRACKED files only (git grep), so ignored trees are already out of
#     scope. The exclude pathspecs below are belt-and-braces.
#   - Excludes its own three files: the rules file and the vendored canon both
#     necessarily contain every banned string, so without this the guard always
#     fails on itself.
#   - Globbing is disabled (set -f) so pathspec wildcards reach git intact
#     instead of being expanded by the shell first.
#   - Hashes are taken over CR-free bytes, so a checkout with core.autocrlf=true
#     cannot produce a phantom out-of-sync failure.

set -uf

SELF="scripts/check-positioning.sh"
RULES="scripts/positioning-rules.txt"
CANON="scripts/canonical.json"
CANON_MSG="Canonical source: Vault/Design/canonical.json"
SYNC_CMD="node Design/sync-canonical.js"

TAB=$(printf '\t')

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "check-positioning: not inside a git repository" >&2
    exit 2
}
cd "$root" || exit 2

[ -f "$RULES" ] || {
    echo "check-positioning: missing $RULES" >&2
    echo "  This file is generated. Run: $SYNC_CMD" >&2
    exit 2
}
[ -f "$CANON" ] || {
    echo "check-positioning: missing $CANON" >&2
    echo "  This file is vendored from the Vault. Run: $SYNC_CMD" >&2
    exit 2
}

# Space-separated pathspecs, expanded UNQUOTED on purpose so each becomes a
# separate argument. No entry may contain a space.
SCOPE=":(exclude)$SELF :(exclude)$RULES :(exclude)$CANON"
SCOPE="$SCOPE :(glob,exclude)**/node_modules/** :(glob,exclude)**/vendor/**"
SCOPE="$SCOPE :(glob,exclude)**/dist/** :(glob,exclude)**/build/**"
SCOPE="$SCOPE :(glob,exclude)**/bin/** :(glob,exclude)**/obj/**"
SCOPE="$SCOPE :(glob,exclude)**/.smithery/**"
SCOPE="$SCOPE :(glob,exclude)**/package-lock.json :(glob,exclude)**/composer.lock"
SCOPE="$SCOPE :(glob,exclude)**/Gemfile.lock :(glob,exclude)**/poetry.lock"

work=$(mktemp -d) || exit 2
trap 'rm -rf "$work"' EXIT INT TERM
findings="$work/findings"
: > "$findings"

# --- sync verification ---------------------------------------------------
# Three questions, each answered as loudly as it can be:
#   1. was the rules file hand-edited?          (always answerable, needs a sha tool)
#   2. was it generated from the vendored canon? (always answerable, needs a sha tool)
#   3. is the vendored canon stale vs the Vault? (only when the Vault is reachable)
# Anything that cannot be answered is reported as UNVERIFIED, never assumed OK.

SHA_TOOL=""
if command -v sha256sum >/dev/null 2>&1; then SHA_TOOL="sha256sum"
elif command -v shasum >/dev/null 2>&1; then SHA_TOOL="shasum -a 256"
elif command -v openssl >/dev/null 2>&1; then SHA_TOOL="openssl dgst -sha256 -r"
fi

hdr_val() {
    sed -n "s/^# $1: //p" "$RULES" | tr -d '\r' | head -1
}

sha_of_file() {
    tr -d '\r' < "$1" | $SHA_TOOL | cut -d' ' -f1
}

sed -n '/^#RULES/,$p' "$RULES" | tail -n +2 | tr -d '\r' > "$work/rules.tsv"

sync_state="ok"
sync_msg=""
note_stale() {
    sync_state="stale"
    sync_msg="$sync_msg
  $1"
}
note_unverified() {
    [ "$sync_state" = "stale" ] || sync_state="unverified"
    sync_msg="$sync_msg
  $1"
}

if [ -z "$SHA_TOOL" ]; then
    note_unverified "No sha256 tool (sha256sum/shasum/openssl) found: could NOT verify that"
    note_unverified "$RULES matches $CANON. Rules are being applied UNVERIFIED."
else
    want_rules=$(hdr_val "rules-sha256")
    have_rules=$(sha_of_file "$work/rules.tsv")
    if [ "$want_rules" != "$have_rules" ]; then
        note_stale "$RULES was HAND-EDITED (rules-sha256 mismatch)."
        note_stale "  expected $want_rules"
        note_stale "  actual   $have_rules"
        note_stale "  That file is generated. Change canon and re-run: $SYNC_CMD"
    fi
    want_canon=$(hdr_val "canonical-sha256")
    have_canon=$(sha_of_file "$CANON")
    if [ "$want_canon" != "$have_canon" ]; then
        note_stale "$RULES was NOT generated from the current $CANON (canonical-sha256 mismatch)."
        note_stale "  expected $want_canon"
        note_stale "  actual   $have_canon"
        note_stale "  Re-run: $SYNC_CMD"
    fi
fi

# Locate the Vault canon: explicit env var first, then a bounded walk upwards.
vault_canon=""
if [ -n "${VIRTUALSMS_CANON:-}" ]; then
    if [ -f "$VIRTUALSMS_CANON" ]; then
        vault_canon="$VIRTUALSMS_CANON"
    else
        note_unverified "VIRTUALSMS_CANON is set to '$VIRTUALSMS_CANON' but no file is there."
    fi
else
    _p="../Vault/Design/canonical.json"
    _i=0
    while [ $_i -lt 6 ]; do
        if [ -f "$_p" ]; then vault_canon="$_p"; break; fi
        _p="../$_p"
        _i=$((_i + 1))
    done
fi

if [ -n "$vault_canon" ]; then
    tr -d '\r' < "$vault_canon" > "$work/vault.json"
    tr -d '\r' < "$CANON" > "$work/vendored.json"
    if cmp -s "$work/vault.json" "$work/vendored.json"; then
        freshness="verified against $vault_canon"
    else
        note_stale "$CANON is STALE: it differs from the Vault canon at $vault_canon."
        note_stale "  The ban list being applied is NOT what canon currently says."
        note_stale "  Re-run: $SYNC_CMD"
        freshness="STALE"
    fi
else
    note_unverified "Vault not reachable from this checkout, so canon freshness could NOT be"
    note_unverified "verified. Rules ran off the vendored copy, which may be out of date."
    note_unverified "Set VIRTUALSMS_CANON=/path/to/Vault/Design/canonical.json to verify here."
    freshness="UNVERIFIED (no Vault in reach)"
fi

# --- scan ----------------------------------------------------------------
# emit <git-grep-output> <label> <reason>
emit() {
    printf '%s\n' "$1" | while IFS= read -r _hit; do
        printf '%s\n      banned term: "%s"  (%s)\n' "$_hit" "$2" "$3" >> "$findings"
    done
}

while IFS="$TAB" read -r rtype rlabel rreason rpattern rinclude rexclude; do
    [ -n "${rtype:-}" ] || continue
    case "$rtype" in \#*) continue ;; esac
    [ "$rexclude" = "-" ] && rexclude=""

    case "$rtype" in
        literal)
            out=$(IFS=' '; git grep -I -n -i -F -e "$rpattern" -- $rinclude $SCOPE $rexclude 2>/dev/null) ;;
        numeric)
            # Numeric bans carry a "not preceded by another digit" guard: without
            # it a ban on a low count also fires inside a HIGHER canonical count
            # that ends with the same digits, and a ban on a small country count
            # fires inside a larger one. The guard consumes the preceding
            # character, which is harmless because git grep reports whole lines
            # anyway. Deliberately worded without examples: this script must
            # contain ZERO banned strings, so that its self-exclusion is
            # belt-and-braces rather than the only thing keeping it green.
            out=$(IFS=' '; git grep -I -n -i -E -e "(^|[^0-9])$rpattern" -- $rinclude $SCOPE $rexclude 2>/dev/null) ;;
        regex)
            out=$(IFS=' '; git grep -I -n -i -E -e "$rpattern" -- $rinclude $SCOPE $rexclude 2>/dev/null) ;;
        dash)
            # Built with printf so this script stays pure ASCII and encoding-safe.
            _em=$(printf '\342\200\224')   # U+2014 em dash
            _en=$(printf '\342\200\223')   # U+2013 en dash
            out=$(IFS=' '; git grep -I -n -F -e "$_em" -e "$_en" -- $rinclude $SCOPE $rexclude 2>/dev/null) ;;
        *)
            echo "check-positioning: unknown rule type '$rtype' in $RULES" >&2
            exit 2 ;;
    esac
    [ -n "$out" ] && emit "$out" "$rlabel" "$rreason"
done < "$work/rules.tsv"

# --- verdict -------------------------------------------------------------
rule_count=$(grep -c . "$work/rules.tsv" 2>/dev/null || echo 0)
profile=$(hdr_val "profile")

if [ "$sync_state" = "stale" ]; then
    echo "check-positioning: FAILED - vendored canon is OUT OF SYNC"
    printf '%s\n' "$sync_msg"
    echo
    echo "  Refusing to report a clean bill of health against a ban list that does"
    echo "  not match canon. Fix the sync first, then re-run."
    if [ -s "$findings" ]; then
        echo
        echo "  Banned copy also found (from the STALE rules, treat as indicative):"
        sed 's/^/  /' "$findings"
    fi
    echo
    echo "  $CANON_MSG"
    exit 3
fi

if [ -s "$findings" ]; then
    echo "check-positioning: FAILED - banned copy found"
    echo
    sed 's/^/  /' "$findings"
    echo
    echo "  Each hit is file:line: followed by the offending text."
    echo "  Fix the copy to match canonical values, do not weaken this check."
    echo "  Rules are generated from canon; to change a ban, change canon."
    echo "  $CANON_MSG"
    exit 1
fi

if [ "$sync_state" = "unverified" ]; then
    echo "check-positioning: OK - no banned copy in tracked files."
    echo "  profile: $profile, $rule_count rules applied, canon freshness: $freshness"
    echo
    echo "  !! FRESHNESS NOT VERIFIED:"
    printf '%s\n' "$sync_msg"
    echo
    echo "  The scan passed, but this is NOT a statement that the ban list is current."
    echo "  $CANON_MSG"
    exit 0
fi

echo "check-positioning: OK - no banned copy in tracked files."
echo "  profile: $profile, $rule_count rules applied, canon $freshness"
echo "  $CANON_MSG"
exit 0
