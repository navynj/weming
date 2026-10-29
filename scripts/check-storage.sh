#!/usr/bin/env bash
# Every storage call goes through the adapter (lib/storage, 2026-10-28).
#
# Who may see an object is decided in our code and SQL before lib/storage
# signs or writes anything; a storage client called anywhere else is a path
# around that check, and a call the R2 backend would never see. Tests are
# exempt: the database tests ask the buckets' own policies directly, as each
# user. A line that must reach storage some other way says why and carries
# `storage-boundary: allow` on the line above.
set -euo pipefail

roots=(app features components lib scripts proxy.ts instrumentation.ts instrumentation-client.ts)
hits="$(grep -rn -B1 --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' \
  -E '\.storage\b|/storage/v1/' "${roots[@]}" 2>/dev/null |
  awk '/storage-boundary: allow/ { skip = 1; next }
       /^[^:]+:[0-9]+:/ { if (!skip) print; skip = 0; next }
       { skip = 0 }' |
  grep -v -E '^lib/storage/|^lib/database\.types\.ts' || true)"

if [ -n "$hits" ]; then
  echo "✖ Storage called outside lib/storage:" >&2
  echo "$hits" >&2
  echo "" >&2
  echo "  Use storage() from lib/storage (server) or putSigned (browser) instead." >&2
  exit 1
fi

echo "✓ every storage call goes through lib/storage"
