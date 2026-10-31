#!/usr/bin/env bash
# The admin dashboard reads metadata only, and only its admin may open it
# (H71). This holds the structure that keeps it so:
#
#   1. Dashboard code (app/admin, features/admin, lib/admin) reaches the
#      database through admin_* functions alone (0071): no .from(), no
#      .schema(), no storage, no other rpc, no content table named, and no
#      import of the app's own readers or clients, which select content.
#   2. The service client is made in lib/admin/access.ts only, after its
#      notFound() check.
#   3. No client component imports lib/admin, the dashboard's components, or
#      the service-role key.
#   4. Dashboard code renders on the server, with one kind of exception: a
#      client component in features/admin that draws numbers it is handed
#      (the pool page's charts). It may import react and ./kinds and nothing
#      else, nor read the environment, so it can reach no data, client, key or
#      other admin code.
set -euo pipefail

dirs=(app/admin features/admin lib/admin)
fail=0
report() {
  echo "✖ $1" >&2
  printf '%s\n' "$2" | sed 's/^/    /' >&2
  fail=1
}

hits="$(grep -rnE '\.from\(|\.schema\(|\.storage\b|/rest/v1|/storage/v1' "${dirs[@]}" || true)"
[ -z "$hits" ] || report "Dashboard code reads a table or storage directly:" "$hits"

hits="$(grep -rnE "\.rpc\(" "${dirs[@]}" | grep -vE "\.rpc\('admin_[a-z_]+'" || true)"
[ -z "$hits" ] || report "Dashboard code calls a function that is not admin_*:" "$hits"

content='splashes|ripples|ripple_replies|ripple_reactions|ripple_audience|splash_placements|splash_origins|profiles|notifications|pool_members|pools|media'
hits="$(grep -rnE "['\"\`](${content})['\"\`]" "${dirs[@]}" || true)"
[ -z "$hits" ] || report "Dashboard code names a table:" "$hits"

hits="$(grep -rnE "from '@/(lib/queries|lib/supabase/client|lib/storage|lib/avatars|lib/media|lib/ripple-media)" "${dirs[@]}" || true)
$(grep -rnE "from '@/features/" "${dirs[@]}" | grep -v "from '@/features/admin/" || true)"
hits="$(printf '%s\n' "$hits" | sed '/^$/d')"
[ -z "$hits" ] || report "Dashboard code imports a content reader:" "$hits"

hits="$(grep -rnE "@supabase/supabase-js|@/lib/supabase/server|supabaseServiceRoleKey" "${dirs[@]}" |
  grep -v '^lib/admin/access.ts:' || true)"
[ -z "$hits" ] || report "A Supabase client is made outside lib/admin/access.ts:" "$hits"

guard="$(grep -n 'notFound()' lib/admin/access.ts | head -1 | cut -d: -f1)"
made="$(grep -n 'createServiceClient<' lib/admin/access.ts | head -1 | cut -d: -f1)"
if [ -z "$guard" ] || [ -z "$made" ] || [ "$made" -le "$guard" ]; then
  report "lib/admin/access.ts must make its service client after the notFound() check." \
    "notFound() at line ${guard:-none}, createServiceClient at line ${made:-none}"
fi

clients="$(grep -rlE "^['\"]use client['\"]" app features components lib --include='*.ts' --include='*.tsx' || true)"
if [ -n "$clients" ]; then
  # shellcheck disable=SC2086
  hits="$(grep -nE "@/lib/admin|@/features/admin|supabaseServiceRoleKey|SUPABASE_SERVICE_ROLE_KEY|lib/invite-visits" $clients || true)"
  [ -z "$hits" ] || report "A client component reaches admin code or the service role:" "$hits"
fi
hits="$(grep -rlE "^['\"]use client['\"]" "${dirs[@]}" | grep -v '^features/admin/' || true)"
[ -z "$hits" ] || report "Dashboard code must render on the server only:" "$hits"
for file in $(grep -rlE "^['\"]use client['\"]" features/admin || true); do
  hits="$(grep -nE "^import|from '|require\(|import\(|process\.env" "$file" |
    grep -vE "from 'react';?$|from '\./kinds';?$" || true)"
  [ -z "$hits" ] || report "A dashboard client component imports more than react and ./kinds:" "$hits"
done

[ "$fail" -eq 0 ] || exit 1
echo "✓ the admin dashboard reads metadata through admin_* functions only"
