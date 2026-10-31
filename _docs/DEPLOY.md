# Shipping Weming

P1's last session: cloud Supabase, Vercel, during.today. Written as a
checklist because it is done once and then referred to when something breaks.

**Read `CLAUDE.md` § "Data is real now" first.** Production has no backups but
the ones we take, and `db reset` is never pointed at it.

## 0. What I cannot do for you

Three things need your browser and your account. Everything else is scripted.

```bash
supabase login                    # opens a browser; run it as `! supabase login`
pnpm dlx vercel login             # or use the dashboard, below
```

The Google Cloud console change in step 3 is by hand, deliberately: it is the
one place where a wrong value fails silently.

## 1. The Supabase project — DONE

**Project `during`, ref `yjwkjvzbbujoapeuyjul`, region `us-west-1`**, in the
Whaleblue Studio org. It already existed; no second project was created.

**Functions run in `sfo1`** (`vercel.json` `regions`, 2026-10-27), next to
`us-west-1`: a render makes its Supabase calls in sequence, so each one pays
the distance between the function and the database.

**G3's second-free-org plan turned out to be unnecessary.** The org holds two
projects — `Plot`, which is INACTIVE (paused, so it does not hold an active
slot), and `during`. Nothing had to be deleted or moved. G3's reasoning still
stands for the day a third project is wanted.

```bash
supabase link --project-ref yjwkjvzbbujoapeuyjul
pnpm backup                       # mandatory; the free tier keeps none
pnpm db:push                      # refuses without a dump from today
```

Applied `0001`–`0004`, `"seeds":[]` — nothing seeded prod. Migration `0003`
created the private `ripple-media` bucket, confirmed present and `public =
false`.

**`0005_splash_pivot` is pending (H20).** It drops the
`ripples_top_level_no_overlap` exclusion constraint, so `pnpm db:push` will
refuse it until the approval from the session brief is passed through, after
today's backup:

```bash
pnpm backup
DURING_DDL_APPROVED='drop the btree_gist exclusion constraint by migration (it now rejects legitimate overlapping records)' pnpm db:push
```

Afterwards the catalogue check below reads one constraint fewer and one
policy more (`splashes belong to their owner`); the four triggers are
unchanged, dormant with inner ripples.

**`0006_date_only_span` is pending too.** It drops the
`ripples_ended_needs_time` check and adds `ripples_ended_needs_date` in its
place, so a fragment can span to an end date with no clock (time is
optional). Approved and applied to the local stack on 2026-09-27; the
DB-backed `date-only-span` suite covers it. Push it with today's backup and
the approval passed through:

```bash
pnpm backup
DURING_DDL_APPROVED='drop the ripples_ended_needs_time check by migration. time is optional. for ripple.' pnpm db:push
``` Existing rows are untouched: every
one keeps its `occurred_on`, and only fragments written from now on can be
unannotated. The Focus lane retires by hand in-app once it is empty; a lane
holding records refuses deletion, so nothing here moves a record.

### Verified live

```bash
pnpm verify:prod        # signed out, every table must be empty or refused
```

All thirteen tables empty, unsigned bucket read refused (400).

**On its own that is a weak signal against an empty database** — every table
is empty regardless, so it cannot tell "RLS on" from "no data". What settles
it is the shipped schema: 13 tables, **13 with RLS enabled, none missing**, 21
policies, 10 functions, all four triggers (`ripples_set_started_at`,
`ripples_check_inner`, `ripples_parent_contains_children`,
`ripples_touch_last_active`) and the `ripples_top_level_no_overlap` exclusion
constraint. Checked against the live catalogue:

```bash
supabase db query --linked "select tgname from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where not tgisinternal and relname = 'ripples';"
```

`pnpm verify:prod` keeps its value once real records exist, which is when a
missing policy would actually leak something.

Then, signed in on the deployed site, confirm a second account cannot see your
rows. The local suite proves the policies; this proves they shipped.

### Seeds cannot reach it

`pnpm seed:me` runs `docker exec` against the local container — it has no path
to a remote project at all. `pnpm db:reset` refuses outright (see CLAUDE.md
§ "Data is real now"). Neither is a matter of remembering.

### Prod starts empty — her call, made in the deploy session

No data migration. Local records stay local and keep being dumped; production
begins with nothing and fills up from the phone. This doubles as the one eye
check the empty states have never had: the first sign-in shows a zero-record
Home, an empty Lanes and an empty Trail for real rather than in a test.

Carrying the archive over stays possible later — it needs an author_id remap
(local and prod auth are different stacks, so every uuid differs) and a manual
re-upload of media objects. Nothing here forecloses it.

## 2. Auth on the cloud project — DONE

| Field | Value |
| --- | --- |
| Site URL | `https://during.today` |
| Redirect URLs | `https://during.today/auth/callback` |
| Google provider | enabled, same client ID and secret as local |

Set through the Management API rather than the dashboard, three keys at a
time:

```bash
TOKEN="$(security find-generic-password -s 'Supabase CLI' -a supabase -w)"
curl -X PATCH "https://api.supabase.com/v1/projects/<ref>/config/auth" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"site_url":"...","uri_allow_list":"...","external_google_enabled":true,
       "external_google_client_id":"...","external_google_secret":"..."}'
```

The token is the one `supabase login` already stored in the keychain, so
there is no second credential to manage. Verified afterwards that
`mfa_totp_enroll_enabled` is still true — nothing outside those keys moved.

`supabase/config.toml` stays pointed at local — it is the local stack's
config, and changing it would send local sign-ins to production.

**The S0 lesson, restated:** `additional_redirect_urls` is matched as an exact
string and a miss falls back to Site URL **silently**. `lib/site.ts` builds
every redirect from `NEXT_PUBLIC_SITE_URL` for exactly this reason, and the
timezone travels in a cookie rather than a query parameter because a query
string is enough to miss the match.

**Symptom when this is missing:** sign-in returns
`Unsupported provider: provider is not enabled` (a 400, `validation_failed`).
The provider is off, not misconfigured — nothing about the client ID or the
redirect URIs will change it.

### Why not `supabase config push`

`config push` has no scope filter — it is the whole file or nothing, and
`supabase config diff` against this project reports **17 differences**. Most
are local-dev conveniences that have no business on production: MFA enrolment
off, OTP length 6, email confirmations off, Twilio disabled, a smaller pooler.
Pushing two correct values by dragging fifteen wrong ones along is not a
trade worth making, so `config.toml` stays the local stack's config and prod
auth is set in the dashboard.

## 3. Google Cloud console — by hand

<https://console.cloud.google.com/apis/credentials> → the **existing** OAuth
client (no new one; a second client means a second consent record).

**Authorized redirect URIs → Add:**

```
https://<project-ref>.supabase.co/auth/v1/callback
```

That is Supabase's callback, not the app's. The browser goes
Google → Supabase → `during.today/auth/callback`, and Google only ever needs
the middle one. Keep the existing `http://127.0.0.1:54321/auth/v1/callback`
entry: local dev still uses it.

**Do not touch** the consent screen. It stays in **Testing** with your account
as the only test user until P2 — publishing it starts a verification review
that a closed-group app does not need.

## 4. Vercel

Import the repo (`navynj/during`). Framework preset: Next.js.

`vercel.json` sets the build command to `next build` and nothing else: the
checks run before it, not in it. A production build waits for this commit's
CI run (`.github/workflows/ci.yml`: types, lint and format once, the suite
minus the files that need a live Postgres in three parallel shards) and is
skipped unless it passed (`scripts/vercel-ignore.mjs`). Locally, the
pre-commit hook checks what is staged and the pre-push hook runs the whole
suite, the database tests included (`vitest.config.mts` names them).

### Environment variables — Production and Preview

| Name | Value | Reaches |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon key | browser and server |
| `NEXT_PUBLIC_SITE_URL` | `https://during.today` — **Production only** | browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | the project's service role key | **server only** |
| `CRON_SECRET` | a random string (`openssl rand -hex 32`) — **Production only**, *Sensitive* | **server only** |
| `ADMIN_USER_IDS` | the admin's auth user id(s), comma separated — **Production only** | **server only** |

**Previews set no `NEXT_PUBLIC_SITE_URL`, per branch or otherwise.** When it is
unset on a Vercel preview, `lib/site.ts` uses `https://${VERCEL_BRANCH_URL}` —
the branch's own preview URL — and `next.config.ts` bakes that into the build
as `NEXT_PUBLIC_SITE_URL`, so the browser and the server agree. A production
build without `NEXT_PUBLIC_SITE_URL` fails in `next.config.ts`. Signing in on
a preview still needs its URL in Supabase Auth's redirect allowlist (a pattern
such as `https://weming-git-*-navynjs-projects.vercel.app/**` covers every
branch).

The three `NEXT_PUBLIC_` values reach the browser by design — the anon key is
a public identifier, and RLS is what protects the data.

**`SUPABASE_SERVICE_ROLE_KEY` is server-only and required.** It bypasses RLS,
so it must never be `NEXT_PUBLIC_` and should be marked *Sensitive* in
Vercel. It is needed because the `ripple-media` bucket is private: the
service role signs photo URLs (`lib/media.ts`, after the viewer's own session
has passed the RLS visibility check) and removes objects on delete. Nothing
else imports it, and `lib/env.ts` is the only place it is read.

**`CRON_SECRET` guards the daily media sweep** (H70, `app/api/cron/sweep-media`).
Vercel Cron (`vercel.json`, 11:00 UTC) sends it as `Authorization: Bearer …`;
without it set, the route answers 401 to everyone, the cron included, and
nothing is swept. To see what a run would remove without removing it:
`curl -H "Authorization: Bearer $CRON_SECRET" https://during.today/api/cron/sweep-media?dry`,
or `scripts/sweep-media.mjs` from a laptop. Each run logs one line of counts
and bytes per bucket (Vercel → Logs, `[during] media sweep`), never a path.

**`ADMIN_USER_IDS` opens `/admin`** (H71), the metadata-only dashboard. Unset or
empty, nobody is an admin and `/admin` is a 404 for everyone. The id is
`auth.users.id` (Supabase → Authentication → Users). Signed out, `/admin`
redirects to sign-in like every other path; signed in and not listed, it is
the same 404 as a page that does not exist. Every admin page checks on its
own (`lib/admin/access.ts`); there is no admin API endpoint.

**The photo incident.** An earlier version of this page said the service key
never goes to Vercel. It was missing on the first photo deploy, the service
client threw a generic "supabaseKey is required" from inside Home's render,
and the whole site was down. Two guards came out of it:

- `instrumentation.ts` checks the four variables once at server startup and
  fails with `Missing <NAME>` — the log says what to set. Every read goes
  through `lib/env.ts`, which names the variable the same way, and no client
  is created at a module's top level, so one missing value cannot poison a
  route's chunk.
- Media signing is fallible per item: a photo that cannot be signed renders
  a quiet placeholder tile, and the page renders. `signOwnMedia` never throws.

**These never go to Vercel:**

- `SUPABASE_AUTH_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_GOOGLE_SECRET` — these
  configure the *local* Supabase stack. In cloud, Supabase holds them.

### Domain

Vercel → Settings → Domains: add the apex and its `www`. Follow the registrar
instructions Vercel prints.

**The domain is nowhere in the repo.** `vercel.json` redirects `www` to the
apex by matching `www\.(?<apex>.*)` and sending the request to `:apex`, so it
works for whatever domain the project is attached to. The app learns its
origin from `NEXT_PUBLIC_SITE_URL` and nothing else — `lib/site.ts` is the
only reader — so one build serves a preview, a local run and production.
`pnpm lint` fails if the production domain appears in `app/`, `features/`,
`components/`, `lib/`, or the config files.

## 5. Prod smoke

Sign in on the phone, then walk the backlog. This is the P1 definition of
done, on the device it was built for:

- [ ] Drop from all three entry points: FAB, timeline slot, lane chip
- [ ] A manual past span → renders as a bundle
- [ ] A plan with a future span → planned, reduced opacity
- [ ] Timer → now band → `/now` → Break (bubbles) → inner drop → Stop
- [ ] A deliberate overlap → the collision is named, with the nest offer
- [ ] An All-day note
- [ ] Edit a note, a time, an end
- [ ] A retroactive inner ripple on a finished session
- [ ] A photo from the phone camera
- [ ] Delete a session that has an inner ripple → both gone, media too
- [ ] Walk Lanes, then the Trail
- [ ] Add to Home Screen → opens standalone, no browser chrome

## Afterwards

**Backups run weekly on their own, and `pnpm backup` stays mandatory before
every push.** The free tier keeps no backups; these are the only copies. See
§ Backups below.

## Migrations: the pipeline

**The rule.** Every migration works with both the app in production and the app
being deployed. A breaking change is split into **expand** (add only), deploy,
and **contract** (remove only, after the new app is live); a contract ships in
a later release, never with the code that stops using the old objects.

**On a pull request** that adds or changes a migration,
`.github/workflows/migrations-compat.yml` starts a local Supabase with every
migration, finds the commit Vercel last deployed to Production (GitHub's
deployment records), and runs that commit's database tests against it. A
failure blocks the PR: "this migration breaks the running app; split it into
expand and contract".

**Expected failures: only for an intended change to validation or limits.**
A migration that deliberately changes what the database accepts — a range
widened, a value newly allowed or refused — can break a production test that
pins the old rule, while the running app is fine. Such a migration lists each
of those tests in a header comment block, by its full name (the describe
titles and the test's own, joined by `" > "`, exactly as vitest prints them),
with the reason:

```sql
-- compat-expected-failures:
--   "a pool layout > refuses values outside the ranges, unknown keys, and a font size between whole pixels": 0050 widens label.width to 4 on purpose
```

`scripts/compat-expected.mjs` judges the run from vitest's JSON results. It
reads the blocks of the **pending** migrations only (in the PR, not in
production's commit). The check passes when every failing production test is
listed; it fails on any unlisted failure, on a test file that did not run, and
on a listed test that passed or no longer exists, so a stale entry is cleaned
up rather than carried. The listed expectations that matched are printed in
the log and the job summary, so the PR shows what was knowingly broken.

**Never use it to work around an app incompatibility.** If a production test
fails because the running app would break — a column it reads is gone, a
function it calls changed shape, a policy it relies on is narrower — the
migration is split into expand and contract, not listed. Update the test in the
same PR so the next production commit carries the new rule. Never merge past a
red check.

**On a push to main** that changes `supabase/migrations`,
`.github/workflows/migrate.yml`:

1. backs up the database and storage, encrypted (`backup-run.yml`, the weekly
   job's steps);
2. waits in the **`production-db`** environment for Yoonji's approval in
   GitHub (Actions → the run → Review deployments);
3. runs `scripts/db-push.sh` against `SUPABASE_DB_URL`, the approval for each
   destructive migration read from the quote in its file (one without it is
   refused);
4. calls the Vercel deploy hook.

**Vercel's Ignored Build Step** (`scripts/vercel-ignore.mjs`) builds production
only when CI passed for the commit and production has applied every migration
in it, asked through `applied_migrations()` (0046) with the build's service
key. Otherwise it skips with "Waiting for migration <name> approval", so an app
commit landing while a migration awaits approval waits too, and the deploy
hook's build is the one that goes live.

**Emergency path.** `pnpm backup` then `pnpm db:push` (with
`DURING_DDL_APPROVED='…'` for destructive DDL) still work by hand; then
redeploy main in Vercel.

### Release: 0073, the admin dashboard's per-user view (2026-10-31)

0073 adds `splashes.is_welcome` and `ripples.is_welcome` and backfills them
once, but the pipeline applies the migration **before** the deploy. A welcome
splash planted in between is made by the old app, which does not set the
flag, and would count as a Home-only record the person never wrote. So the
backfill runs again once the new app is live:

1. Merge the 0073 PR (#33), approve it in `production-db`, and wait until
   Vercel's production deployment of that commit is **Ready**: from then on
   `plantWelcomeSplash` sets the flags itself.
2. Then merge the follow-up PR that adds `0074_welcome_backfill_rerun.sql`
   (the same two `update` statements, idempotent: they only turn the flag on,
   matched by the built-in photo `app:welcome/shell.png`), and approve it the
   same way. The pipeline backs up first, as for any migration.
3. Read the run's log for the line `0074: flagged N welcome splash(es)` — a
   count only. N is usually 0; anything above it was a splash planted in
   the window, now left out of the dashboard's counts.

Merging 0074 early does no harm, but misses the point: it must land after
step 1's deploy to catch the window.

### Settings and secrets

GitHub → Settings → Environments → **New environment** `production-db`:
required reviewers: Yoonji; deployment branches: `main` only.

GitHub → Settings → Secrets and variables → Actions:

| Name | Kind | What |
| --- | --- | --- |
| `SUPABASE_DB_URL` | secret | already set for the weekly backup (Session pooler URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | already set for the weekly backup |
| `SUPABASE_URL`, `BACKUP_AGE_PUBLIC_KEY` | variables | already set for the weekly backup |
| `VERCEL_DEPLOY_HOOK_URL` | secret | Vercel → Settings → Git → Deploy Hooks → name "migrations", branch `main` |

Vercel needs nothing new: the Ignored Build Step reads
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Production
already has.

## Errors: Sentry

Production and previews report errors to Sentry (org `whaleblue-studio`,
project `weming`); a local run sends nothing. The setup is
`lib/observability.ts`, `instrumentation.ts` (server and edge) and
`instrumentation-client.ts` (browser).

**What is sent, and what never is.** An event keeps the error's type, message
and stack, the route (its path, no query string), an opaque user id and the
release (the commit SHA). `sendDefaultPii` is off; request bodies, form data,
query strings, cookies, headers, breadcrumbs, extra data and stack-frame
variables are removed; any text that looks like a photo's path or a file's
name becomes `<path>` / `<file>`. No Session Replay. Errors are sent every
time; traces a tenth of the time in production, never in a preview.

**Failures with a reason.** A failed upload, compose, edit or join is reported
even when nothing threw, tagged `op:upload`, `op:compose`, `op:edit` or
`op:join`, with the reason only (`lib/report-failure.ts`).

**Source maps** are uploaded by Vercel's production build, the one that makes
the bundle, then deleted, so they are never served. A build without the token
(a preview, a local run) makes none.

### Settings

- **Vercel → Settings → Environment Variables**: `SENTRY_AUTH_TOKEN`, sensitive,
  Production only (scopes `project:releases`, `org:read`). Nothing else: the DSN
  is public by design and lives in `lib/observability.ts`.
- **GitHub**: nothing.
- **Sentry → Settings → Projects → weming → Security & Privacy**: Data Scrubber
  on, Use Default Scrubbers on, Prevent Storing of IP Addresses on — a second
  net under the app's own scrubbing.

### Alerts (email)

Sentry → Alerts → Create Alert → Issues:

1. **New issue**: "A new issue is created" → action "Send a notification to
   Member: Yoonji (email)". Environment: production.
2. **Spike**: "The issue is seen more than 20 times in 1 hour" → the same
   email action. Environment: production.

### Looking up an error

- A stuck page: `watchdog:stall` is a main thread that sent no heartbeat for
  5s (reported by a worker, `lib/watchdog.worker.ts`); `watchdog:blank` is a
  page area that drew nothing for 3s (`features/auth/page-slot.tsx`), its
  `recovery` context saying whether the refresh was tried or Reload offered.
  Both carry the route pattern, the route before it and timings, nothing else.
- From a friend's report: Sentry → Issues, filter `environment:production`,
  then by time; `op:upload` (or compose, edit, join) narrows to that kind of
  failure.
- From a commit: filter `release:<sha>` — the commit Vercel built.
- The user id on an event is an opaque id: match it to a profile in Supabase
  only if the person asked for help.

## Next.js is patched

`patches/next@16.3.5.patch` (H64), applied by pnpm on every install, Vercel's
included (`pnpm-workspace.yaml` → `patchedDependencies`). It makes Next's
router fetch again a page segment whose data was cut off, instead of reusing
it and drawing a blank page.

**On any Next upgrade:** re-check every `patches/next@*.patch` against the new
code. pnpm refuses a patch that no longer applies, but one that still applies
can patch the wrong thing, and an upstream fix can make it redundant (the
draft upstream report is `_docs/NEXT-UPSTREAM-BLANK-SEGMENT.md`). Then run
`e2e/fast-switch.spec.ts` (`pnpm test:e2e e2e/fast-switch.spec.ts --project prod`)
before merging: it switches pools as fast as possible for 30s, and forces the
blank with the patch turned off to prove the page still recovers.

## Backups

Two copies, the same contents: the database dump (schema, then data), every
object in the `ripple-media` and `avatars` buckets with its path, and a
manifest with the object count and bytes.

### Local: `pnpm backup`

Dumps the database and downloads storage (`<stamp>.sql`,
`<stamp>/storage/<bucket>/<path>`, `<stamp>/storage/manifest.json`), then
**seals them**: one `backups/<stamp>.tar.gz.age`, encrypted with age to the
same public key as the weekly artifact (`BACKUP_AGE_PUBLIC_KEY`, read from the
environment or the repo variable through `gh`). Nothing stays plain at rest
but this backup's `<stamp>.sql`, kept for the push it was made for:
`pnpm db:push` refuses without an archive from today and deletes today's plain
dump when it ends, either way. Each run also seals any plain copy still in
`backups/` (earlier dumps, storage folders and lists, local database dumps),
and deletes archives older than 60 days, so the 60 days the account-deletion
sheet promises hold here as they do for the artifact. All gitignored. It
reads production through the linked project; the storage service key comes
from the logged-in Supabase CLI and is never printed.

Open one with the offline private key:

```sh
age -d -i <path to weming-backup.key> backups/<stamp>.tar.gz.age | tar -xzf - -C ~/weming-restore
```

### Weekly: the encrypted GitHub artifact

`.github/workflows/backup.yml` runs every Sunday at 03:00 UTC and on demand
(Actions → Backup → Run workflow). It packs the dump, the storage folder and
the manifest into one `tar.gz`, encrypts it with age to the public key in the
repo variable `BACKUP_AGE_PUBLIC_KEY`, checks the age header, and uploads it
as the artifact `weming-backup-<stamp>`, kept 60 days. The private key is
never on GitHub. Each run downloads every object; there is no private key in
CI to reuse an earlier archive.

It reads, from Settings → Secrets and variables → Actions:

| Name | Kind | What |
|---|---|---|
| `SUPABASE_DB_URL` | secret | Session pooler URI with the database password (Connect → Session pooler) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Project Settings → API Keys: `service_role`, or a secret key |
| `SUPABASE_URL` | variable | `https://<ref>.supabase.co` |
| `BACKUP_AGE_PUBLIC_KEY` | variable | the `age1…` line from `age-keygen` |

The log is public, because the repo is. It prints counts and byte totals only.

**Download and decrypt.** From the run's page (Actions → Backup → the run →
Artifacts), or:

```sh
gh run list -R navynj/weming -w Backup              # pick a run id
gh run download <run-id> -R navynj/weming -D ~/weming-restore
cd ~/weming-restore/weming-backup-<stamp>
age -d -i <path to weming-backup.key> -o backup.tar.gz weming-backup-<stamp>.tar.gz.age
mkdir backup && tar -xzf backup.tar.gz -C backup     # <stamp>.sql and <stamp>/storage/
```

Keep the private key file (`weming-backup.key`) offline, never in the repo:
`*.key` is gitignored as a guard. Without it no artifact can be opened.

### Restoring storage

Rows first, so the paths in `ripples.media` and `profiles.avatar_path` point at
files again. Then re-upload each bucket's folder:

```sh
for bucket in ripple-media avatars pool-photos; do
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
    node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON \
    scripts/restore-storage.mjs backup/<stamp>/storage "$bucket"
done
```

Each object goes back to its own path with the content type the manifest
recorded. Objects already in the bucket are kept unless `--overwrite` is
passed. The script names the target project and waits for its ref to be
typed before it writes anything. The bucket must exist (migrations 0003,
0018 and 0024 make them). Both scripts read and write through the storage
adapter (`lib/storage`), so they follow `STORAGE_BACKEND`. Backups before
2026-10-28 have no `pool-photos` folder: that bucket was not backed up until
then.
