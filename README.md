# Weming

**Weming Diary.** Pool your days with a few close friends. We're swimming side by side,
each in our own lane.

- Product spec: [`_docs/SPEC.md`](_docs/SPEC.md) — authoritative for behavior and vocabulary.
- Decision log: [`_docs/DECISIONS.md`](_docs/DECISIONS.md) — rationale and rejected alternatives.
- Roadmap: [`_docs/ROADMAP.md`](_docs/ROADMAP.md) — session-sized milestones.
- Working rules for contributors and agents: [`CLAUDE.md`](CLAUDE.md).

## Quickstart

Requirements: Node 20+, [pnpm](https://pnpm.io), the
[Supabase CLI](https://supabase.com/docs/guides/local-development), and a container
runtime ([OrbStack](https://orbstack.dev) or Docker Desktop) running.

```bash
pnpm install
cp .env.example .env.local
pnpm db:start           # boots Postgres, Auth, Storage, Realtime locally
```

Use `pnpm db:start` rather than `supabase start` directly: `config.toml` resolves
`env(...)` from the shell environment only, so the script exports `.env.local` first.
Started the other way, the Google client ID is passed to Google as the literal string
`env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)` and sign-in fails with no obvious cause.

`supabase start` prints an `anon key` and a `service_role key`. Paste them into
`.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then:

```bash
pnpm dev                # http://127.0.0.1:3000  (not localhost — see below)
```

Use **http://127.0.0.1:3000** in the browser, not `localhost:3000`. They are two
different origins to Supabase's redirect allowlist, and the app builds every OAuth
return URL from `NEXT_PUBLIC_SITE_URL`. `pnpm dev` binds to that host for the same
reason: Next blocks dev resources requested cross-origin, and a page served to the
other spelling renders but never hydrates, so its buttons do nothing.

Sign-in needs Google OAuth credentials. Create an OAuth client in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials) with
`http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI, and put the
client ID and secret in `.env.local` as `SUPABASE_AUTH_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_GOOGLE_SECRET`. Restart the stack (`supabase stop && pnpm db:start`)
after adding them.

If sign-in returns you to the sign-in page with no session, the return URL is not on
the allowlist: `additional_redirect_urls` in `supabase/config.toml` is matched as an
exact string, and a miss falls back to `site_url` instead of erroring. `pnpm test`
covers this.

## Everyday commands

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `pnpm dev`             | Next.js dev server; warns first if Supabase is unreachable          |
| `pnpm build`           | Production build; must pass with zero type errors                   |
| `pnpm lint`            | ESLint, plus the design-token guard                                 |
| `pnpm format`          | Prettier write                                                      |
| `pnpm test`            | Vitest; the RLS suite needs a running local stack                   |
| `pnpm db:start`        | Boots the local stack with `.env.local` exported                    |
| `pnpm seed:me <email>` | Demo fixture on your own account; skips times your real records own |
| `pnpm db:reset`        | Re-runs every migration, then `supabase/seed.sql`                   |
| `pnpm db:types`        | Regenerates `lib/database.types.ts` from the local schema           |

## Layout

```
app/                     routes and layouts
features/<name>/         components, hooks and queries colocated per feature
components/ui/           shared primitives (waves, chips, sheets)
lib/                     supabase clients, queries, utilities
supabase/migrations/     schema; never edit an applied migration
```

## Schema changes

One migration per change, never an edit to an applied one:

```bash
supabase migration new <name>
# write the SQL, then
pnpm db:reset && pnpm db:types
```
