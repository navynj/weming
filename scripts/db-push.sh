#!/usr/bin/env bash
# The only way schema reaches production.
#
# Two conditions, both from CLAUDE.md's "Data is real now":
#   1. a backup taken today, because the free tier keeps none;
#   2. explicit approval for destructive DDL, quoted, because a DROP cannot be
#      taken back and a policy removed by accident is a leak.
#
# Locally (the emergency path) it is run by hand after `pnpm backup`, with the
# approval passed as DURING_DDL_APPROVED. In the migration pipeline
# (.github/workflows/migrate.yml) the same checks hold, met differently:
#   DURING_BACKUP_RUN       the pipeline's backup run, which just finished;
#   DURING_DB_URL           the database to push to, instead of the linked one;
#   DURING_APPROVAL_FROM_FILES=1
#                           the approval is the quoted block each destructive
#                           migration carries ("approved by Yoonji …"), and
#                           one without it is refused.
set -euo pipefail

if [ -n "${DURING_BACKUP_RUN:-}" ]; then
  echo "  ✓ backup: pipeline run ${DURING_BACKUP_RUN}"
else
  today="$(date +%Y%m%d)"
  if ! ls backups/"${today}"-*.sql >/dev/null 2>&1; then
    echo "✖ No backup from today. Production has no other copy." >&2
    echo "    pnpm backup" >&2
    exit 1
  fi
  echo "  ✓ backup from today: $(ls -t backups/"${today}"-*.sql | head -1)"
fi

# The database: the linked project by hand, a URL in the pipeline.
target=(--linked)
[ -n "${DURING_DB_URL:-}" ] && target=(--db-url "$DURING_DB_URL")

# Which migrations have not reached prod yet.
#
# `migration list` prints JSON in some setups and an ASCII table in others, so
# both are parsed and a parse that finds nothing is a FAILURE rather than an
# empty list — silently deciding "nothing is pending" would skip the
# destructive-DDL check below, which is the one thing here that cannot be
# allowed to no-op.
listing="$(supabase migration list "${target[@]}" 2>/dev/null | grep -v '^Initialising\|^Connecting' || true)"

if echo "$listing" | grep -q '"migrations"'; then
  pending="$(echo "$listing" | python3 -c '
import json, sys
rows = json.loads(sys.stdin.read())["migrations"]
print("\n".join(r["local"] for r in rows if r["local"] and not r.get("remote")))
')"
elif echo "$listing" | grep -q '|'; then
  pending="$(echo "$listing" |
    awk -F'|' 'NF>2 && $1 ~ /[0-9]/ { gsub(/ /,"",$1); gsub(/ /,"",$2); if ($2 == "") print $1 }')"
else
  echo "✖ Could not read the migration list. Refusing to push blind:" >&2
  echo "$listing" | head -5 >&2
  exit 1
fi

if [ -n "$pending" ]; then
  echo "  → pending: $(echo "$pending" | tr '\n' ' ')"
  risky=""
  for version in $pending; do
    file="$(ls supabase/migrations/"${version}"_*.sql 2>/dev/null | head -1 || true)"
    [ -n "$file" ] || continue
    # Comment lines are stripped first: these words appear in rationale far
    # more often than in DDL, and a guard that cries wolf gets bypassed.
    if sed 's/--.*//' "$file" |
      grep -Eiq '\b(drop +(table|column|policy|constraint|function|trigger|type|index))\b|\balter +column\b.*\btype\b'; then
      risky="${risky} ${file}"
    fi
  done

  # In the pipeline, the approval is the one each destructive migration quotes.
  if [ -n "$risky" ] && [ -z "${DURING_DDL_APPROVED:-}" ] && [ "${DURING_APPROVAL_FROM_FILES:-}" = 1 ]; then
    quoted=""
    for file in $risky; do
      said="$(python3 - "$file" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
# The comment block after "approved by Yoonji", its quoted words.
m = re.search(r'approved by Yoonji[^\n]*\n((?:--[^\n]*\n)+)', text)
quote = ''
if m:
    lines = [l[2:].strip() for l in m.group(1).splitlines()]
    joined = ' '.join(lines)
    q = re.search(r'"(.+?)"', joined)
    quote = q.group(1) if q else ''
print(quote)
PY
)"
      if [ -z "$said" ]; then
        echo "✖ ${file} has destructive DDL and no quoted approval from Yoonji." >&2
        exit 1
      fi
      echo "  ✓ approval quoted in ${file}"
      quoted="${quoted:+${quoted} | }${said}"
    done
    DURING_DDL_APPROVED="$quoted"
  fi

  if [ -n "$risky" ] && [ -z "${DURING_DDL_APPROVED:-}" ]; then
    echo "" >&2
    echo "✖ Destructive DDL in:${risky}" >&2
    echo "  This needs Yoonji's explicit approval, quoted in the commit message." >&2
    echo "  When she has given it, pass it through:" >&2
    echo "    DURING_DDL_APPROVED='<what she said>' pnpm db:push" >&2
    exit 1
  fi
  [ -n "$risky" ] && echo "  ✓ destructive DDL approved: ${DURING_DDL_APPROVED:0:160}"
fi

# Flags pass through to the CLI, so `pnpm db:push --include-all` can apply a
# pending migration numbered before the last one already on production (it
# happened with 0030 after 0031). The checks above have already run on every
# pending migration, whatever its number.
supabase db push "${target[@]}" "$@"
