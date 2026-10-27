#!/usr/bin/env bash
# The only way schema reaches production.
#
# Two conditions, both from CLAUDE.md's "Data is real now":
#   1. a backup taken today, because the free tier keeps none;
#   2. explicit approval for destructive DDL, quoted, because a DROP cannot be
#      taken back and a policy removed by accident is a leak.
set -euo pipefail

today="$(date +%Y%m%d)"
if ! ls backups/"${today}"-*.sql >/dev/null 2>&1; then
  echo "✖ No backup from today. Production has no other copy." >&2
  echo "    pnpm backup" >&2
  exit 1
fi
echo "  ✓ backup from today: $(ls -t backups/"${today}"-*.sql | head -1)"

# Which migrations have not reached prod yet.
#
# `migration list` prints JSON in some setups and an ASCII table in others, so
# both are parsed and a parse that finds nothing is a FAILURE rather than an
# empty list — silently deciding "nothing is pending" would skip the
# destructive-DDL check below, which is the one thing here that cannot be
# allowed to no-op.
listing="$(supabase migration list --linked 2>/dev/null | grep -v '^Initialising\|^Connecting' || true)"

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

  if [ -n "$risky" ] && [ -z "${DURING_DDL_APPROVED:-}" ]; then
    echo "" >&2
    echo "✖ Destructive DDL in:${risky}" >&2
    echo "  This needs Yoonji's explicit approval, quoted in the commit message." >&2
    echo "  When she has given it, pass it through:" >&2
    echo "    DURING_DDL_APPROVED='<what she said>' pnpm db:push" >&2
    exit 1
  fi
  [ -n "$risky" ] && echo "  ✓ destructive DDL approved: ${DURING_DDL_APPROVED}"
fi

# Flags pass through to the CLI, so `pnpm db:push --include-all` can apply a
# pending migration numbered before the last one already on production (it
# happened with 0030 after 0031). The checks above have already run on every
# pending migration, whatever its number.
supabase db push "$@"
