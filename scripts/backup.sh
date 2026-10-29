#!/usr/bin/env bash
# A backup of the production project, because the free tier keeps none.
#
#   backups/<stamp>.sql                  schema then data
#   backups/<stamp>/storage/<bucket>/…   every object in ripple-media, avatars, pool-photos
#   backups/<stamp>/storage/manifest.json  object count, bytes, one row per object
#
# All gitignored. Locally it uses the linked project and, for storage, the
# service key the logged-in Supabase CLI hands over; it never prints it.
#
# Locally, nothing stays plain at rest (Yoonji, 2026-10-28): the dump and the
# storage folder are packed and encrypted with age to the same public key as
# the weekly artifact, as backups/<stamp>.tar.gz.age. The plain dump alone
# stays, for the push it was made for; db-push.sh deletes it when the push
# ends, and the next backup seals anything plain still lying here. Archives
# older than 60 days are deleted, so the 60 days the account-deletion sheet
# promises hold here too.
#
# In CI (.github/workflows/backup.yml) the same script runs with
# SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from secrets,
# and BACKUP_OUT naming a folder outside the repo.
set -euo pipefail
set +x # Never trace: the commands carry credentials in their environment.

out="${BACKUP_OUT:-backups}"
mkdir -p "$out"
stamp="$(date +%Y%m%d-%H%M%S)"
dump="${out}/${stamp}.sql"

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  source_flags=(--db-url "$SUPABASE_DB_URL")
  label="the configured database"
else
  ref_file="supabase/.temp/project-ref"
  if [ ! -f "$ref_file" ]; then
    echo "✖ No linked project. Run: supabase link --project-ref <ref>" >&2
    exit 1
  fi
  ref="$(cat "$ref_file")"
  source_flags=(--linked)
  label="${ref}"
  export SUPABASE_URL="${SUPABASE_URL:-https://${ref}.supabase.co}"
  if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    # Read once into the environment of this run; never echoed.
    SUPABASE_SERVICE_ROLE_KEY="$(
      supabase projects api-keys --project-ref "$ref" -o json 2>/dev/null |
        python3 -c 'import json,sys; print(next(r["api_key"] for r in json.load(sys.stdin) if r.get("name") == "service_role"))'
    )" || {
      echo "✖ Could not read the service key from the Supabase CLI (supabase login?)." >&2
      exit 1
    }
    export SUPABASE_SERVICE_ROLE_KEY
  fi
fi

echo "→ dumping ${label}"
{
  echo "-- Weming backup ${stamp}"
  echo "-- schema"
} > "$dump"
# Tool chatter goes to a file, not the log: it may echo connection details.
# On failure only its last lines are shown, with anything shaped like a
# connection string, a pooler user or a database host redacted.
redacted() {
  tail -n 8 "$1" | sed -E \
    -e 's#postgres(ql)?://[^[:space:]"]+#<db-url>#g' \
    -e 's#postgres\.[A-Za-z0-9]+#<db-user>#g' \
    -e 's#[A-Za-z0-9.-]+\.(pooler\.)?supabase\.(com|co)#<db-host>#g' \
    -e 's#(password[=:][[:space:]]*)[^[:space:]]+#\1<redacted>#gI' >&2
}
supabase db dump "${source_flags[@]}" >> "$dump" 2> "${out}/.dump-schema.err" || {
  echo "✖ schema dump failed:" >&2
  redacted "${out}/.dump-schema.err"
  exit 1
}
echo "-- data" >> "$dump"
supabase db dump "${source_flags[@]}" --data-only >> "$dump" 2> "${out}/.dump-data.err" || {
  echo "✖ data dump failed:" >&2
  redacted "${out}/.dump-data.err"
  exit 1
}
rm -f "${out}/.dump-schema.err" "${out}/.dump-data.err"
echo "✓ ${dump} ($(wc -l < "$dump" | tr -d ' ') lines)"

echo "→ downloading storage"
# A plain folder from an earlier backup lends its unchanged objects; locally
# none stays plain, so this reuses only in a run that kept one.
previous="$(ls -d "${out}"/*/storage 2>/dev/null | grep -v "/${stamp}/" | sort | tail -1 || true)"
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON scripts/backup-storage.mjs "${out}/${stamp}/storage" ${previous:+--previous "$previous"}

# CI packs and encrypts in its own steps (backup-run.yml), outside the repo.
[ -n "${BACKUP_OUT:-}" ] && exit 0

key="${BACKUP_AGE_PUBLIC_KEY:-$(gh variable get BACKUP_AGE_PUBLIC_KEY -R navynj/weming 2>/dev/null || true)}"
case "$key" in
  age1*) ;;
  *)
    echo "✖ No age public key (BACKUP_AGE_PUBLIC_KEY, or the repo variable through gh)." >&2
    echo "  The backup is written but plain: ${dump} and ${out}/${stamp}/" >&2
    exit 1
    ;;
esac

# Packs the named entries of backups/ into <name>.tar.gz.age, checks the
# archive and the age header, keeps the newest entry's time on the archive
# (pruning reads it), and only then removes the plain entries.
seal() {
  local name="$1"
  shift
  local archive="${out}/${name}.tar.gz.age" plain
  plain="$(mktemp "${TMPDIR:-/tmp}/weming-seal.XXXXXX")"
  tar -C "$out" -czf "$plain" "$@"
  tar -tzf "$plain" > /dev/null
  age -r "$key" -o "$archive" "$plain"
  rm -f "$plain"
  [ "$(head -c 21 "$archive")" = "age-encryption.org/v1" ] || {
    echo "✖ ${archive} is not an age file; the plain copy is kept" >&2
    rm -f "$archive"
    return 1
  }
  local newest
  newest="$(cd "$out" && ls -td "$@" | head -1)"
  touch -r "${out}/${newest}" "$archive"
  (cd "$out" && rm -rf "$@")
}

# Anyone's plain copy that is not this push's dump: earlier backups and
# their storage lists and folders, and local database dumps, each by stamp.
for entry in "$out"/*.sql "$out"/*.storage.txt "$out"/*/; do
  [ -e "$entry" ] || continue
  base="$(basename "$entry")"
  name="${base%.sql}"
  name="${name%.storage.txt}"
  [ "$name" = "$stamp" ] && continue
  [ -e "${out}/${name}.tar.gz.age" ] && { echo "✖ ${name}: an archive by that name exists; left plain" >&2; continue; }
  parts=()
  for part in "${name}.sql" "${name}.storage.txt" "${name}"; do
    [ -e "${out}/${part}" ] && parts+=("$part")
  done
  [ "${#parts[@]}" -gt 0 ] || continue
  seal "$name" "${parts[@]}"
  echo "✓ sealed ${name}"
done

# This backup: the dump and its storage. The dump stays plain until the push.
cp -p "$dump" "${out}/${stamp}.plain.sql"
seal "$stamp" "${stamp}.sql" "${stamp}"
mv "${out}/${stamp}.plain.sql" "$dump"
echo "✓ ${out}/${stamp}.tar.gz.age (the dump stays plain until the push ends)"

# Kept 60 days, as the weekly artifact is.
find "$out" -maxdepth 1 -name '*.tar.gz.age' -mtime +60 -print -delete | sed 's/^/✓ pruned /'
