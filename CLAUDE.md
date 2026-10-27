# CLAUDE.md

## What this project is

Weming (during.today; renamed from During at H22, user-facing only): a compact blog-form diary on the water. A post (a Splash) is a title and some blocks (Ripples), extended over days and shelved by month and by topic; a one-line post is a complete post (H21). While you write it, your presence shows on the surface for a few close friends. Solo-built portfolio project (design engineer case study) plus real daily use with friends. Records are written for oneself; sharing is a leak, not a broadcast.

## Source of truth

- `_docs/SPEC.md`: the product spec (v0.24). Authoritative for behavior, vocabulary, IA, visual system, schema, and scope. Read the relevant section before building any screen.
- `_docs/DECISIONS.md`: the decision log with rationale and rejected alternatives. Do not re-litigate settled decisions. If implementation genuinely forces a revisit, stop and flag it; never silently deviate.
- `_docs/mockups/`: current Figma exports. Visual reference for layout and the wave grammar. **`home-grid-stack.png` is the layout authority for Home** (H22; its second frame, the solo one — the pool frames are direction only, not built); `home-ground.png` and the lane rows it led to are superseded and kept as history. The post's page, the post sheet and the sessions sheet have no mockup and follow SPEC's written geometry in the ground's visual language. The Splash-pivot frames (`home-ripple-mode.png`, `home-splash-mode.png`, `sheet-ripple.png`, `sheet-splash.png`, `splash-thread.png`) are superseded by H21 and kept as history. The older exports predate SPEC v0.2; where one of those and SPEC conflict, SPEC wins. Flag the conflict instead of guessing.

**If the mockup contains a drawn shape, ask for the Figma-exported SVG before generating one.** Guessing at drawn geometry is the most expensive mistake so far: a generated wave was rebuilt from the export, and the exported numbers turned out to be load-bearing (control offsets that make the amplitude land exactly inside the stroke box). Reading a shape off a PNG gets the impression right and the construction wrong.

**Text replacements in code or docs must assert. A patch that matches nothing is a failure, not a no-op.** A replacement whose target string has drifted — reformatted by Prettier, edited earlier in the session — changes no file, breaks no type, and returns success. Run edits so a failed assertion aborts the task (`set -e`, or chain with `&&`); never let one script's failure leave the next one running.

**After any doc-sync task, grep the file for the new content before claiming it.** A passing build is not evidence that a doc edit landed — documents are not compiled. `scripts/verify-doc.sh FILE "needle" ...` exits non-zero when a string is absent; run it before committing, and let a doc-sync commit message claim only what it printed.

When the spec is silent, choose the smallest implementation consistent with DECISIONS and say so in the commit message. If it smells like a product decision, ask instead of deciding.

## Current scope: P1 (solo-complete), then pool phase 1 (H23)

Scope is cut into phases, solo-first (H11). **P1 makes the app complete for one person, before anyone is invited.** Build in roughly this order:

1. Auth (social login) and profile bootstrap (category seed from preset) — done
2. Wave system, Home Daily read view — done
3. Input sheet — done, then **replaced by the Splash pivot (H20)**: a ripple sheet (chips, note, `+ Add Time`, `+ Add Image`, `+ Add to Splash`, one Drop) and a splash sheet (Add Lanes, title, `+ Add Date`, one Drop). No Timer, no audience chip, no in-sheet mode toggle: the entry path decides which sheet opens
4. Ripple mini half-sheet: tap a wave, see note, annotation, media, splash, lock toggle. **No view count in P1** — counting needs an audience — done
5. Delete (hard delete, including media); photo attach — done
6. Designed empty-state copy — done
7. Lanes read-only matrix; Locker Trail (full personal scroll including locked ripples) — done
8. Deploy: cloud Supabase + Vercel, because daily use on a phone requires it — done
9. The Splash pivot (H20): Splash promoted, six-lane preset, ink-fill selection — done, then **refounded by H21**
10. **The refounding (H21)**: Ripples compose Splashes (a block inside a post); Sessions as shelves (monthly derived, custom made) managed from a sheet the scrubber's `=` opens; Home as the solid-blue water ground scoped to one month (lane rows with each lane's posts as pills on a rope, newest at the left; month scrubber; lane-icon row; pinned bar); the post's white page with in-place writing; one post sheet from the FAB; a declaration (date, lane) is a default, never an override; delete cascades to blocks
11. **Round 3 (2026-10-23)**: the header (lane glyph, Lane | Date toggle) replaces the title menu and the nav; the Date view; titles under marks, six lanes at once; a lane's page at `/lane/[id]` with in-place rename; pinned posts as cards; ripples as threads on the top card and the post's page; one axis per gesture; coming back from a post finds the same card on top; the Locker and Sessions retired as surfaces; renamed Weming — done
12. **The grid and the diving board (H22)**: Home rebuilt as two linked halves — the lane grid above (lanes across, days down, a post a white disc with its lane's emoji at its column and day; a fixed date rail and sticky lane headers in one two-axis scroller; even columns up to seven, fixed past that) and the diving board below (the newest posts as a stack of white cards flipped on `motion`'s spring, a staircase: read cards stepping up above the top card and unread stepping down below, one spring over the stack's depth — the page turn kept behind `BOARD` — the ground's nav beneath — Home, Locker, Sessions — with the white compose disc as the one entry); the ring at the top card's mark links them. The tab bar, the FAB, the lane rows and the month scrubber retired; the Locker, the sessions sheet and the lanes sheet live behind Home's title menu. Product renamed Weming, user-facing only — done

**Dormant, never deleted (H20b):** the Timer commit, the now band, the focus screen (`features/focus/`), Break, inner ripples (`parent_ripple_id` and its triggers stay). Their modules and tests stay in place with no entry point or navigation; P3's Swim is their consumer. Do not wire them back into a surface, and do not remove them.

**The record is a story fragment, not an activity spec (H20a).** The hand throws moments at stories; the machine shelves them in time. A block inherits its post's lane and date and has none of its own (H24, reversing H21f): a post is placed by its own range and lane alone, and an older block's own date and lane are frozen metadata, read back and used for nothing. The exclusion constraint is gone: overlapping spans are legitimate records.

**Compactness and the lane/session structure are the core to defend (H21b).** A feature that makes a post heavier to start, or adds a second axis beside lanes and sessions, is rejected before its merits are heard.

**Pool phase 1 (H23) is built ahead of P2:** create, invite, join with lane mapping, the pool's home (Lane | Date | Swimmers), joint splashes, the per-post Audience chip, leaving. The foot of Home and of a pool is Home · Pool · + (no Locker); the pool switcher hangs off the pool's name.

Explicitly NOT built yet (do not scaffold, stub, or placeholder): Link and invites, Friends, the friend rail, view counts, presence TTL surfacing, Splash shared by two — all P2. Open pools and search, roles on pool lanes, bulk placing earlier records after joining, the follow feed, notifications, Lists UI, Home Weekly — later. Home's header is the lane glyph (lane management) and the Lane | Date toggle; compose is the white disc with the blue `+`. The Locker and Sessions are retired as surfaces (round 3); the `sessions` table and its migration stay, unread. Never add a tab or a menu entry for a screen that has not shipped. The Lanes matrix is dormant for P3's pool Lanes. Pools and Friends are reserved seats: no menu entry, no dead button.

**P1.5** is a dogfood window: daily personal use and small fixes, first candidate the Spotify now-playing suggestion. **P2** adds the Link world and is where the witnessing experiment runs. **P1/P1.5 validate input cost and recall value only — solo usage decay is not evidence of product failure**, because the witnessed hook is absent by design until P2.

## Data is real now

The database holds records someone actually wrote. Everything below outranks convenience, including my own.

1. **Never run `db reset`, or any destructive command, against the linked (production) project.** Not once, not to fix a migration, not because the alternative is slower. **The local database is protected too** — it currently holds real records, and it stays protected until Yoonji says in the session that it is disposable again. `pnpm db:reset` refuses unless `DURING_DB_DISPOSABLE=yes` is set for that one command, which is her declaration and never mine to make.
2. **Migrations are forward-only.** A schema change is a new migration file, rehearsed against a local fixture database, applied to prod with `supabase db push` and nothing else. **Destructive DDL — `DROP`, narrowing a column type, removing an RLS policy — needs her explicit approval in the session, quoted in the commit message.** `pnpm db:push` scans the pending migrations and refuses when it finds any, unless that approval is passed through.
3. **Backups are ours to make: the free tier has none.** `pnpm backup` writes a schema + data dump of the linked database to `backups/<timestamp>.sql` and every storage object, with a manifest, to `backups/<timestamp>/storage/` (all gitignored; unchanged objects are hard-linked from the previous backup). **Running it is mandatory before every push to prod**, and `pnpm db:push` refuses without a dump from today. A weekly GitHub Actions run (`.github/workflows/backup.yml`) keeps the same contents as an age-encrypted artifact for 60 days; only her offline private key opens it. Restoring is in `_docs/DEPLOY.md` § Backups. **The repo is public, so is its Actions log: a backup step prints counts and bytes only, never a credential or an object path.**
4. **Never decide data migration on her behalf.** Whether local records are carried into prod or prod starts empty is her call, asked once, in the session.
5. **Every migration works with both the app in production and the app being deployed.** A breaking change is split: **expand** (add only), deploy the app that uses it, then **contract** (remove only) in a later release, never with the code that stops using the old objects. A pull request that adds a migration runs the production commit's database tests against a database with it applied (`.github/workflows/migrations-compat.yml`); a failure there means split it.
6. **Migrations reach production through the pipeline** (`.github/workflows/migrate.yml`): a push to main that changes `supabase/migrations` makes a backup, waits for her approval in the `production-db` environment, pushes with the approval each destructive migration quotes, then calls the Vercel deploy hook. Vercel skips every production build while the repository holds a migration production has not applied. `pnpm backup` and `pnpm db:push` stay as the emergency path.

## Stack

- Next.js (App Router) + TypeScript strict. Deployed on Vercel.
- Supabase: Postgres, Auth, Storage, Realtime. Local-first development via `supabase start`. Schema changes only through migration files; never edit an applied migration.
- Tailwind CSS. TanStack Query for server state. No global client-state library until a concrete need appears.
- Waves are inline SVG components. No canvas in v1.

## Non-negotiable engineering rules

- **Every edit, add and delete is an optimistic update.** The screen shows the result the moment the hand commits it; the server action runs behind it; the page re-reads inside the same transition so the optimistic state holds until the real rows land; a refusal takes the change back and says why. Never make the author wait on a round trip to see what they just did. The pattern is `lib/use-optimistic-action.ts` (`useOptimistic` + a transition that awaits the action and then `router.refresh()`), and a new post's id is minted in the browser so its mark is the real one from the start.

- **RLS on every table, no exceptions.** The leak model's two visibility paths (Link path, Pool path) are enforced in RLS policies, not in application code. The client must never receive rows the viewer is not allowed to see. Locker-only (locked) ripples are visible solely to their author.
- **Timezone:** `occurred_on` and `occurred_time` are author-local. Day boundaries are computed in the author's timezone (store the author's tz on the profile). This app will be used across Vancouver and Korea from week one.
- **Submerge is never stored.** Presence expiry is computed at read time from the last activity timestamp.
- **Deletes are hard deletes** (privacy over recovery), including storage objects.
- **The deployment's origin is configuration, never source.** It reaches the app through `NEXT_PUBLIC_SITE_URL` and nothing else (`lib/site.ts` is the only reader), so one build serves a preview, a local run and production. A domain written into a file is a second source of truth that only disagrees once, and an origin mismatch fails _silently_ — S0's lesson. `pnpm lint` fails on it.
- One vocabulary, one table: every remaining record is a row in `ripples`.

## Design tokens and visual rules

- The ONLY custom design tokens are three color ramps plus the typeface. Everything else (spacing, radius, type scale) uses the Tailwind default scale.
  - Main ramp (content vitality): `#0507C9` live/now, `#787BE2` recent, `#D3D7F6` settled/past — **the default theme**. Since H26 (0032) the main ramp follows the person's theme colour (one of eleven, `lib/theme.ts`), set on `<html>` as `data-theme`; `main-400` and `main-100` are mixed from it. Write `main-900`, `white` and `joint` as utilities, never a hex: light mode (`data-mode="light"`) swaps `white` and `main-900` inside the water ground, and a white card or sheet on the ground carries `surface` to stay white with ink.
  - Gray ramp (structure): `#F1F3F7` surfaces, `#D8DCE8` deeper surfaces / dividers / lane ropes, `#6B79A3` muted text
  - Ink: `#161621` body text (was `#313338` until the refounding review)
- Typeface: **Poppins** (weights 300/400/500/600/700), self-hosted via `next/font/google` and exposed as Tailwind's `--font-sans`, so `font-sans` and `body` cannot drift apart. The type size _scale_ is untouched.
- **The smallest type is 10px** (`text-[10px]`). Nothing smaller, bar a genuine exception that carries an `allow-small-text` comment saying why; `pnpm lint` fails otherwise.
- Tracking is tightened 5%: the whole `--tracking-*` scale shifts by `-0.05em` (so `tracking-normal` is `-0.05em`), and `body` states it because browsers default to `0`. Shifting the scale rather than only the base keeps the steps' relative distance.
- **Weight: `font-semibold` is the emphasis weight.** Reach for it wherever you would reflexively write `font-bold`; 600 carries emphasis in Poppins without the heaviness. `font-bold` (700) stays loaded for the rare case that genuinely needs it, but is not the default. The header's year + month label is `font-medium`.
- **Two fills, two meanings (H20f).** Solid `#0507C9` (`main-900`) fill = **action**: Drop, +Drop, the compose `+`, waves. Solid ink `#161621` fill = **selection**: the selected category chip, the selected lane header, the pinned bar. The sessions sheet's current month reads in `#0507C9` text, no fill. White text on both. Blue fills on a white screen point only at what commits or creates; a selected chip is `bg-ink text-white`, never `bg-main-900`. Outline chips (a post's lane tags) are never filled.
- **The ground inverts (H21c).** Home's ground is solid `#0507C9` (`.water-ground`): the water, not a live session. On it, white carries content and action (a post's mark on the grid — a white disc with its lane's emoji — the cards of the diving board, waves as data, the lane headers and ropes) and ink stays selection: the pinned bar, the title menu. A post's wave mark is white waves on a blue disc, per the mockup; on a shelf, a lone block standing in as a post is the inverse pill — blue with a white/50 outer border, its mark a white disc with blue waves and no border. The post's page is a white page above the water.
- **`#787BE2` (`main-400`) is a chip foreground and a wave tone. Nothing else.** Its only text use is the foreground of small tag-like chips (the duration chip); otherwise it exists solely inside the wave vitality ramp as the "recent" tone. It is not a general accent color, and it never colors headings, labels, time markers, or chrome. An unselected category chip's text is `pool-500`, not `main-400`.
- Text colors, in full:
  - Default text: `#161621` (ink).
  - Emphasis / accent text: `#0507C9` (`main-900`).
  - Muted or secondary text, only where the hierarchy needs it: `#6B79A3` (`pool-500`).
  - `#D3D7F6` is never text.
  - Active or selected states in chrome (pagers) use `#0507C9` (`main-900`) with weight; inactive is the same color faded by `opacity-20` on the item wrapper, never per-element alpha — one fade for the whole item, so icon and label can never drift apart. This is chrome, not content: SPEC 7 law 1 reserves the opacity channel for _time_ on Ripples, and nav state is neither.
- `pnpm lint` fails on `main-400` or `#787BE2` used outside `components/ui/chips/` and `components/ui/waves/` (see `scripts/check-tokens.sh`). If a new directory legitimately renders chips or waves, add it to that allowlist rather than working around the check.
- Category emojis keep their native colors: the single allowed off-palette element.
- **Motion: only living things move.** An in-progress timed grows its last wave line; a new drop plays one expanding ring that settles to a single ring. One stated exception: the ghost ring at the head of a list ripples continuously, the invitation being the seat of the next living thing (SPEC 7 law 3). Nothing else _in the water_ animates. Chrome moves on its own terms — a sheet rises, the diving board flips on `motion`'s spring (H22) — the app moving, not the record; `motion` is the one motion library, and a second spring system is rejected on sight. `prefers-reduced-motion` fallback is mandatory, and every design must read correctly when static.
- Wave grammar: timed = multi-line bundle whose line count is log-scaled on duration (cap 10) at a constant gap, so height is a consequence of density, not a measure of span; drop = single wave line; a splash = its fragment count on the log scale, right-anchored. Wave counts are impressions (calm / some / lots), never precise gauges. The axis is ordered, not time-proportional: vertical distance measures nothing.
- On the ground, time reads down the grid — the newest day at the top, each lane a column — and the past recedes as the grid scrolls into earlier months (H22). The stack at the foot is the present: the newest posts, the drop bar. On the white continuous scrolls the past sinks (backgrounds step white, then `#F1F3F7`, then `#D8DCE8`): the Trail, Lanes. Planned-at-reduced-opacity is retired (H20c): a future-dated block is a normal block with a future date chip. Tone and opacity never encode ownership.

## Code conventions

- **Domain vocabulary in code.** Identifiers use Ripple, drop, timed, Link, Pool, Lane, Splash, Session, Swim, Locker, Submerge, List. Forbidden identifiers: post, entry, item, group, feed, stream, deck, follower, thread. If the word is retired in SPEC section 2, it does not appear in code either. ("Fragment", "block" and "post" are descriptive prose for a Ripple and a Splash, never identifiers. "Session" in code means a shelf (H21); the dormant live modules keep their old `session` identifiers until P3 renames them.)
- Structure: `app/` for routes and layouts, `features/<name>/` (components, hooks, queries colocated per feature: `features/home/`, `features/splash/`, `features/splash-sheet/`, `features/lanes/`), `components/ui/` for shared primitives (waves, chips, pills), `lib/` for supabase clients and utilities, `supabase/migrations/` for schema.
- Server components for shells and data fetch; client components for anything that moves or accepts input. Keep components small; extract when a file passes ~150 lines.
- TypeScript: strict, no `any`, explicit return types on exported functions. Validate at boundaries (forms, route handlers) with zod. Database types generated via `supabase gen types`.
- Files kebab-case, components PascalCase, hooks `useX`.
- Comments explain why, not what. When implementing a spec rule, reference it: `// SPEC 7, law 3: only living things move`.
- Conventional commits, small and frequent. One migration per schema change.

## Definition of done for P1

I can run my own day through it, on my own phone, without help. Drop a post from the compose `+` with a title line and two paragraphs and watch the ring at its mark on the grid and its card land on top of the stack; flip it up the stair and watch the ring move to the next card's mark, then tap it back down; drop a one-line untitled post; open a post and extend it in place, and see the new block take the post's lane and date; change a post's date or lane and watch it move, every block with it (H24); pin a post and reach it from its pinned card while scrolled back to August; open a lane's page and rename the lane in place. Attach a photo, delete a post and have its blocks and media go with it. Read a month as a grid of lanes and days on the ground, with eight lanes scrolling sideways under the fixed rail, and as a list of days in the Date view. Every empty state shows designed copy instead of a blank.

No friend appears anywhere in that list. That is the point: P1 is finished when the app is worth opening daily with nobody watching (H15).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
