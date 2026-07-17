#!/bin/sh
#
# publish.sh - the ONE command that publishes virtualsms-mcp to npm.
#
# Publishing to a public registry is NOT UNDOABLE. npm versions are immutable;
# `npm unpublish` is policy-gated after 72h. The realistic rollback is
# `npm deprecate` plus a fixed patch release. This script is built on that
# assumption: it is paranoid on purpose, and it would rather refuse 10 times
# than ship one wrong tarball.
#
# Usage:
#   sh scripts/publish.sh              # DRY RUN (default). Runs every gate, publishes NOTHING.
#   sh scripts/publish.sh --confirm    # Runs every gate, then publishes if ALL are green.
#
# Exit codes:
#   0  all gates green (dry run: ready to publish / confirm: published)
#   1  one or more gates FAILED
#   2  harness error (wrong directory, missing tool)
#
# WHAT THIS SCRIPT DOES NOT DO, ON PURPOSE
#   It runs `npm publish` and nothing else. It does NOT git push, does NOT edit
#   the GitHub About blurb, does NOT touch mcp.so, and does NOT redeploy the
#   hosted endpoint. Those are separate steps with separate credentials and
#   separate failure modes, and a script that silently did them could not be
#   reasoned about at 2am. The ORDER of those steps matters and lives in
#   Vault/Operations/2026-07-17-mcp-publish-runbook.md. Read it first.
#
#   In particular: PUBLISHING DOES NOT UPDATE mcp.virtualsms.io. The hosted
#   endpoint installs the PUBLISHED tarball via scripts/deploy-mcp.sh, which is
#   a separate command on a separate branch. If you publish and stop, the README
#   says 41 tools while the endpoint most people use still serves 18. That is
#   the exact bug this whole effort exists to kill. See runbook step 3.
#
# WHY THERE ARE NO BRAND STRINGS IN THIS FILE
#   Gate 10 reads every banned pattern at runtime from
#   scripts/positioning-rules.txt, generated from canon. It does NOT hardcode
#   them. Hardcoding a ban list is the exact defect the 2026-07-17 canon purge
#   removed: the anti-leak file became the largest concentration of the strings
#   it existed to ban, and it ships inside published packages. Do not "helpfully"
#   inline a supplier name here to make a check stricter. Ban the SHAPE in canon,
#   re-run the sync, and this script picks it up for free.
#
# DRY RUN vs CONFIRM, and why they differ
#   --confirm ABORTS AT THE FIRST FAILED GATE. Nothing is published unless every
#   single gate is green; that property is absolute and is what makes this safe.
#   --dry-run RUNS EVERY GATE AND REPORTS ALL OF THEM, then exits non-zero if any
#   failed. A pre-flight that stops at the first problem forces ten round trips to
#   learn ten things. The dry run is a report; the confirm is a gate.

set -u

TARGET_BRANCH="feature/mcp-tier-a-hardening"
EXPECTED_NPM_USER="virtualsms"
PKG_NAME="virtualsms-mcp"
RULES="scripts/positioning-rules.txt"
GUARD="scripts/check-positioning.sh"
RUNBOOK="Vault/Operations/2026-07-17-mcp-publish-runbook.md"

CONFIRM=0
for arg in "$@"; do
    case "$arg" in
        --confirm) CONFIRM=1 ;;
        --dry-run) CONFIRM=0 ;;
        -h|--help)
            sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "publish: unknown argument '$arg' (expected --confirm or --dry-run)" >&2
            exit 2 ;;
    esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "publish: not inside a git repository" >&2
    exit 2
}
cd "$root" || exit 2

command -v node >/dev/null 2>&1 || { echo "publish: node not found" >&2; exit 2; }
command -v npm  >/dev/null 2>&1 || { echo "publish: npm not found"  >&2; exit 2; }

work=$(mktemp -d) || exit 2
trap 'rm -rf "$work"' EXIT INT TERM

FAILED=0
FAILED_GATES=""

pass() { printf '  [ PASS ] gate %s: %s\n' "$1" "$2"; }
info() { printf '           %s\n' "$1"; }
fail() {
    printf '  [ FAIL ] gate %s: %s\n' "$1" "$2"
    [ -n "${3:-}" ] && printf '           %s\n' "$3"
    FAILED=1
    FAILED_GATES="$FAILED_GATES $1"
    if [ "$CONFIRM" = "1" ]; then
        printf '\npublish: ABORTED at gate %s. Nothing was published.\n' "$1" >&2
        exit 1
    fi
}

echo
echo "=============================================================="
if [ "$CONFIRM" = "1" ]; then
    echo " virtualsms-mcp publish  --  CONFIRM MODE (WILL PUBLISH)"
else
    echo " virtualsms-mcp publish  --  DRY RUN (publishes nothing)"
fi
echo "=============================================================="
echo " repo: $root"
echo

# --- gate 1: npm auth ------------------------------------------------------
# THE gate. Everything else is ready; this is the only real blocker.
npm_user=$(npm whoami 2>/dev/null)
if [ -z "$npm_user" ]; then
    fail 1 "npm whoami failed (not logged in)" \
        "Run: npm login --auth-type=legacy  (user $EXPECTED_NPM_USER). See $RUNBOOK step 1."
elif [ "$npm_user" != "$EXPECTED_NPM_USER" ]; then
    fail 1 "npm whoami is '$npm_user', expected '$EXPECTED_NPM_USER'" \
        "Wrong account. Run: npm logout && npm login --auth-type=legacy"
else
    pass 1 "npm whoami = $npm_user"
fi

# --- gate 2: branch + clean tree -------------------------------------------
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
dirty=$(git status --porcelain 2>/dev/null)
if [ "$branch" != "$TARGET_BRANCH" ]; then
    fail 2 "on branch '$branch', expected '$TARGET_BRANCH'" \
        "Publishing from the wrong tree is how an uncommitted dep ships."
elif [ -n "$dirty" ]; then
    fail 2 "working tree is DIRTY" \
        "$(printf '%s' "$dirty" | head -5 | tr '\n' ';')"
else
    pass 2 "on $TARGET_BRANCH, working tree clean"
fi

# --- gate 3: typecheck -----------------------------------------------------
if npx tsc --noEmit > "$work/tsc.log" 2>&1; then
    pass 3 "tsc --noEmit exit 0"
else
    fail 3 "tsc --noEmit FAILED" "$(head -3 "$work/tsc.log" | tr '\n' ' ')"
fi

# --- gate 4: tests ---------------------------------------------------------
if npm test > "$work/test.log" 2>&1; then
    tests_line=$(grep -E '^\s*Tests\s+' "$work/test.log" | tail -1 | sed 's/^[[:space:]]*//')
    pass 4 "npm test green (${tests_line:-passed})"
else
    fail 4 "npm test FAILED" "$(grep -E 'FAIL|Tests ' "$work/test.log" | head -3 | tr '\n' ' ')"
fi

# --- gate 5: positioning guard ---------------------------------------------
# Three separate assertions. Exit 0 alone is NOT enough: the guard exits 0 while
# printing "FRESHNESS NOT VERIFIED" when it cannot reach the Vault, which means
# it scanned against a ban list it cannot prove is current. A publish must not
# accept that. Exit 3 means the vendored canon is stale or hand-edited.
if [ ! -f "$GUARD" ]; then
    fail 5 "$GUARD is missing"
else
    sh "$GUARD" > "$work/guard.log" 2>&1
    guard_rc=$?
    if [ "$guard_rc" -ne 0 ]; then
        fail 5 "$GUARD exited $guard_rc (expected 0)" \
            "$(head -4 "$work/guard.log" | tr '\n' ' ')"
    elif ! grep -q 'profile: mixed-content' "$work/guard.log"; then
        fail 5 "guard is not running the mixed-content profile" \
            "$(grep -i 'profile:' "$work/guard.log" | head -1)"
    elif grep -q 'UNVERIFIED' "$work/guard.log"; then
        fail 5 "guard could not verify canon freshness (UNVERIFIED)" \
            "Re-run with VIRTUALSMS_CANON=/path/to/Vault/Design/canonical.json"
    elif ! grep -q 'canon verified against' "$work/guard.log"; then
        fail 5 "guard did not report 'canon verified against'" \
            "$(grep -i 'canon' "$work/guard.log" | head -1)"
    else
        pass 5 "guard clean, profile: mixed-content, canon verified"
    fi
fi

# --- gate 6: playwright is not a runtime dep -------------------------------
# ~300MB to every installer. An uncommitted package.json in the main checkout
# adds it; nothing in src/ imports it.
pw=$(node -e 'const d=require("./package.json").dependencies||{};console.log(Object.keys(d).filter(k=>/playwright|puppeteer/i.test(k)).join(","))' 2>/dev/null)
if [ -n "$pw" ]; then
    fail 6 "browser automation package in dependencies: $pw" \
        "This ships ~300MB to every installer. Nothing in src/ imports it."
else
    pass 6 "no playwright/puppeteer in dependencies"
fi

# --- gate 7: version agreement + not already published ---------------------
# Every hand-typed version field must agree. These JSON manifests are the drift
# surface: no build step generates them. src/ derives VERSION from package.json
# structurally, so it cannot drift and is not re-checked here.
node > "$work/ver.txt" 2>"$work/ver.err" <<'NODE'
const fs = require('fs');
const rd = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const pkg = rd('package.json');
const srv = rd('server.json');
const plg = rd('.plugin/plugin.json');
const fields = [
  ['package.json version', pkg.version],
  ['server.json version', srv.version],
  ...(srv.packages || []).map((p, i) => [`server.json packages[${i}].version`, p.version]),
  ['.plugin/plugin.json version', plg.version],
];
const bad = fields.filter(([, v]) => v !== pkg.version);
console.log('TARGET=' + pkg.version);
console.log('COUNT=' + fields.length);
console.log('BAD=' + bad.map(([k, v]) => `${k}=${v}`).join('; '));
NODE
if [ -s "$work/ver.err" ]; then
    fail 7 "could not read version fields" "$(head -2 "$work/ver.err" | tr '\n' ' ')"
    TARGET_VERSION=""
else
    TARGET_VERSION=$(sed -n 's/^TARGET=//p' "$work/ver.txt")
    ver_count=$(sed -n 's/^COUNT=//p' "$work/ver.txt")
    ver_bad=$(sed -n 's/^BAD=//p' "$work/ver.txt")
    if [ -n "$ver_bad" ]; then
        fail 7 "version fields DISAGREE" "$ver_bad"
    else
        published=$(npm view "$PKG_NAME" versions --json 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const v=JSON.parse(d);console.log((Array.isArray(v)?v:[v]).join(" "))}catch(e){console.log("")}})')
        if [ -z "$published" ]; then
            fail 7 "could not read published versions from the registry" \
                "npm view $PKG_NAME versions returned nothing. Network or auth issue."
        elif printf ' %s ' "$published" | grep -q " $TARGET_VERSION "; then
            fail 7 "version $TARGET_VERSION is ALREADY PUBLISHED" \
                "npm versions are immutable. Bump the version; you cannot overwrite."
        else
            pass 7 "$ver_count version fields agree at $TARGET_VERSION, not yet published"
            info "registry latest: $(npm view "$PKG_NAME" version 2>/dev/null)"
        fi
    fi
fi

# --- gate 8: tarball contents ----------------------------------------------
# What actually reaches the registry. package.json "files" is an allowlist, but
# an allowlist is a claim until you read the manifest it produces.
npm pack --dry-run --json > "$work/pack.json" 2>"$work/pack.err"
if [ ! -s "$work/pack.json" ]; then
    fail 8 "npm pack --dry-run produced no manifest" "$(head -2 "$work/pack.err" | tr '\n' ' ')"
else
    PACKJSON="$work/pack.json"; export PACKJSON
    node > "$work/pack.txt" 2>&1 <<'NODE'
const fs = require('fs');
const raw = fs.readFileSync(process.env.PACKJSON, 'utf8');
let files;
try { files = JSON.parse(raw)[0].files.map(f => f.path); }
catch (e) { console.log('PROBS=could not parse pack manifest: ' + e.message); process.exit(0); }
const probs = [];
const hit = (re, why) => { const m = files.filter(f => re.test(f)); if (m.length) probs.push(`${why}: ${m.slice(0,5).join(', ')}`); };
hit(/(^|\/)\.env($|\.)/i, 'env file in tarball');
hit(/(^|\/)canonical\.json$/i, 'vendored canon in tarball');
hit(/(^|\/)positioning-rules\.txt$/i, 'rules file in tarball');
hit(/(^|\/)scripts\//i, 'scripts/ in tarball');
hit(/\.(pem|key|p12|pfx)$/i, 'credential-shaped file in tarball');
hit(/(^|\/)(id_rsa|\.npmrc|\.git-credentials)$/i, 'credential file in tarball');
hit(/^dist\/src\//, 'dist is NESTED (dist/src/...) - breaks main and bin');
if (!files.includes('dist/index.js')) probs.push('MISSING dist/index.js (package main + bin)');
if (!files.includes('dist/http-server.js')) probs.push('MISSING dist/http-server.js (the hosted endpoint runs this)');
console.log('FILES=' + files.length);
console.log('PROBS=' + probs.join(' | '));
NODE
    pack_probs=$(sed -n 's/^PROBS=//p' "$work/pack.txt")
    pack_files=$(sed -n 's/^FILES=//p' "$work/pack.txt")
    if [ -n "$pack_probs" ]; then
        fail 8 "tarball contents are WRONG" "$pack_probs"
    else
        pass 8 "tarball clean: $pack_files files, dist/ flat, no secrets, no canon"
    fi
fi

# --- gate 9: tool count in the copy == the built server's tools/list --------
# THE GATE THAT WOULD HAVE CAUGHT THE STALE TOOL COUNT SURVIVING FOR MONTHS.
# (The stale count is not written out here on purpose: canon bans the literal,
# and this file gets no carve-out. CHANGELOG.md has one because a dated release
# record is true as history; a comment quoting the number is just a quote, and it
# reads exactly the same without it.)
# Everything else in this script checks that a string is absent. This one checks
# that a NUMBER IS TRUE, by asking the actual built server and comparing. A string
# matcher cannot do this: a count that is true today is false after the next merge
# and still passes every ban list. Only this reconciliation catches that.
if ! npm run build > "$work/build.log" 2>&1; then
    fail 9 "npm run build FAILED (cannot count tools without a build)" \
        "$(tail -3 "$work/build.log" | tr '\n' ' ')"
else
    dump_tools() {
        printf '%s\n%s\n' \
            '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"publish-gate","version":"0.0.0"}}}' \
            '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
        | VIRTUALSMS_SANDBOX=1 VIRTUALSMS_API_KEY=publish-gate VIRTUALSMS_ENABLE_SESSIONS="$1" \
          node dist/index.js 2>/dev/null \
        | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{for(const l of d.split(/\r?\n/)){if(!l.trim())continue;try{const m=JSON.parse(l);if(m.id===2&&m.result&&m.result.tools){console.log(m.result.tools.length);return;}}catch(e){}}console.log("")});'
    }
    ACTUAL_DEFAULT=$(dump_tools "")
    ACTUAL_GATED=$(dump_tools "1")

    if [ -z "$ACTUAL_DEFAULT" ] || [ -z "$ACTUAL_GATED" ]; then
        fail 9 "could not read tools/list from the built server" \
            "default='$ACTUAL_DEFAULT' gated='$ACTUAL_GATED'"
    else
        DEFAULT_N="$ACTUAL_DEFAULT"; export DEFAULT_N
        GATED_N="$ACTUAL_GATED";     export GATED_N
        node > "$work/count.txt" 2>&1 <<'NODE'
const fs = require('fs');
const actual = Number(process.env.DEFAULT_N);
const gated  = Number(process.env.GATED_N);
const readme = fs.readFileSync('README.md', 'utf8');
const probs = [];

// Group sub-counts, e.g. "<summary><strong>Rentals (10 tools)</strong>".
const groups = [...readme.matchAll(/\((\d+)\s+tools?\)/g)].map(m => Number(m[1]));
const groupSum = groups.reduce((a, b) => a + b, 0);

// Every "N tools" claim in the shipped copy: README + the three descriptions.
const descs = ['package.json', 'server.json', '.plugin/plugin.json']
  .map(p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).description || ''; } catch { return ''; } })
  .join('\n');
const claims = [...(readme + '\n' + descs).matchAll(/(\d+)\s+tools?\b/g)].map(m => Number(m[1]));

const allowed = new Set([actual, gated, ...groups]);
const bad = [...new Set(claims.filter(c => !allowed.has(c)))];

if (bad.length) probs.push(`copy claims tool counts that the server does not serve: ${bad.join(', ')} (server serves ${actual} by default, ${gated} with sessions on)`);
if (groups.length && groupSum !== actual) probs.push(`README group counts sum to ${groupSum} but the server serves ${actual}`);
if (!claims.includes(actual)) probs.push(`README never states the real default count (${actual})`);

console.log('GROUPS=' + groups.join('+') + '=' + groupSum);
console.log('PROBS=' + probs.join(' | '));
NODE
        count_probs=$(sed -n 's/^PROBS=//p' "$work/count.txt")
        count_groups=$(sed -n 's/^GROUPS=//p' "$work/count.txt")
        if [ -n "$count_probs" ]; then
            fail 9 "TOOL COUNT MISMATCH between the copy and the server" "$count_probs"
        else
            pass 9 "tool count reconciles: server serves $ACTUAL_DEFAULT by default ($ACTUAL_GATED gated), README agrees"
            info "README groups: $count_groups"
        fi
    fi
fi

# --- gate 10: banned strings in the ACTUAL tarball --------------------------
# Not redundant with gate 5. The guard scans TRACKED SOURCE and explicitly
# EXCLUDES dist/. This scans WHAT SHIPS, which is dist/ plus README. A banned
# string living in a compiled tool description reaches users and the guard never
# looks at it. Patterns are read from the generated rules file: this script
# contains no brand strings of its own, by rule.
if [ ! -f "$RULES" ]; then
    fail 10 "$RULES is missing (cannot derive the ban list)" \
        "It is generated. Run: node Design/sync-canonical.js"
else
    tarball_dir="$work/tb"
    mkdir -p "$tarball_dir"
    if ! npm pack --pack-destination "$tarball_dir" > "$work/packreal.log" 2>&1; then
        fail 10 "npm pack failed (cannot inspect the real tarball)" \
            "$(tail -2 "$work/packreal.log" | tr '\n' ' ')"
    else
        tgz=$(find "$tarball_dir" -maxdepth 1 -name '*.tgz' | head -1)
        if [ -z "$tgz" ]; then
            fail 10 "npm pack produced no tarball"
        else
            tar -xzf "$tgz" -C "$tarball_dir" 2>/dev/null
            pdir="$tarball_dir/package"
            if [ ! -d "$pdir" ]; then
                fail 10 "unexpected tarball layout (no package/ dir)"
            else
                : > "$work/hits"
                TAB=$(printf '\t')
                # Dash rules are scoped to prose + manifests per the spec. The
                # rest scan everything that ships.
                dash_scope=$(find "$pdir" -maxdepth 1 \( -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) 2>/dev/null)
                all_scope=$(find "$pdir" -type f \
                    ! -name '*.png' ! -name '*.jpg' ! -name '*.gif' ! -name '*.ico' 2>/dev/null)

                sed -n '/^#RULES/,$p' "$RULES" | tail -n +2 | tr -d '\r' > "$work/rules.tsv"
                while IFS="$TAB" read -r rtype rlabel rreason rpattern rinclude rexclude; do
                    [ -n "${rtype:-}" ] || continue
                    case "$rtype" in \#*) continue ;; esac
                    out=""
                    case "$rtype" in
                        literal)
                            out=$(printf '%s\n' "$all_scope" | tr '\n' '\0' | xargs -0 -r grep -I -n -i -F -e "$rpattern" 2>/dev/null) ;;
                        numeric)
                            out=$(printf '%s\n' "$all_scope" | tr '\n' '\0' | xargs -0 -r grep -I -n -i -E -e "(^|[^0-9])$rpattern" 2>/dev/null) ;;
                        regex)
                            out=$(printf '%s\n' "$all_scope" | tr '\n' '\0' | xargs -0 -r grep -I -n -i -E -e "$rpattern" 2>/dev/null) ;;
                        dash)
                            _em=$(printf '\342\200\224'); _en=$(printf '\342\200\223')
                            out=$(printf '%s\n' "$dash_scope" | tr '\n' '\0' | xargs -0 -r grep -I -n -F -e "$_em" -e "$_en" 2>/dev/null) ;;
                        *)
                            echo "publish: unknown rule type '$rtype' in $RULES" >&2 ;;
                    esac
                    if [ -n "$out" ]; then
                        printf '%s\n' "$out" | head -3 | while IFS= read -r h; do
                            printf '%s [%s]\n' "$(printf '%s' "$h" | sed "s#$pdir/##")" "$rlabel" >> "$work/hits"
                        done
                    fi
                done < "$work/rules.tsv"

                rules_n=$(grep -c . "$work/rules.tsv" 2>/dev/null || echo 0)
                if [ -s "$work/hits" ]; then
                    fail 10 "BANNED COPY IN THE TARBALL (this is what reaches users)" \
                        "$(head -6 "$work/hits" | tr '\n' ';')"
                else
                    pass 10 "tarball clean against all $rules_n canon rules (incl. dist/, which the guard skips)"
                fi
            fi
        fi
    fi
fi

# --- summary ---------------------------------------------------------------
echo
echo "--------------------------------------------------------------"
if [ "$FAILED" = "1" ]; then
    echo " RESULT: BLOCKED. Failed gate(s):$FAILED_GATES"
    echo
    echo " Nothing was published."
    echo " Fix the gate(s) above and re-run. Runbook: $RUNBOOK"
    echo "--------------------------------------------------------------"
    exit 1
fi

echo " RESULT: ALL GATES GREEN"
echo "--------------------------------------------------------------"
echo
echo " WHAT WILL HAPPEN IF YOU CONFIRM:"
echo "   npm publish  ->  $PKG_NAME@$TARGET_VERSION  (PUBLIC registry, as $EXPECTED_NPM_USER)"
echo "   tools served by this build: $ACTUAL_DEFAULT by default"
echo
echo " THIS IS NOT UNDOABLE. npm versions are IMMUTABLE. unpublish is"
echo " policy-gated after 72h. The realistic rollback is 'npm deprecate'"
echo " plus a fixed patch release. There is no undo button."
echo
echo " THIS SCRIPT DOES NOT: git push, edit the GitHub About blurb, touch"
echo " mcp.so, or redeploy mcp.virtualsms.io. The hosted endpoint still"
echo " serves the OLD build until you run scripts/deploy-mcp.sh deploy."
echo " Publishing alone recreates the 'README says 41, endpoint serves 18'"
echo " bug. See $RUNBOOK."
echo

if [ "$CONFIRM" != "1" ]; then
    echo " DRY RUN. Nothing was published."
    echo " To publish for real:  sh scripts/publish.sh --confirm"
    echo
    exit 0
fi

echo " --confirm given. Publishing in 5s. Ctrl-C to abort."
sleep 5
echo
if npm publish; then
    echo
    echo "publish: PUBLISHED $PKG_NAME@$TARGET_VERSION"
    echo
    echo "NEXT, IN ORDER (none of it happened automatically):"
    echo "  1. Redeploy the hosted endpoint, or it keeps serving the old build:"
    echo "       scripts/deploy-mcp.sh deploy $TARGET_VERSION"
    echo "     (that script lives on branch fix/find-cheapest-stock-source)"
    echo "  2. Push the branch + tag to GitHub."
    echo "  3. Hand-set the surfaces nothing generates: GitHub About, mcp.so."
    echo "  4. Verify: curl the hosted tools/list and count. Expect $ACTUAL_DEFAULT."
    echo "  Full ordering + verification: $RUNBOOK"
    exit 0
else
    echo
    echo "publish: npm publish FAILED. See the output above." >&2
    exit 1
fi
