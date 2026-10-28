# Weming Roadmap

Session-sized milestones. One session = one Claude Code working block with a demoable definition of done. Order within a phase is dependency order; do not pull later sessions forward. The tab bar grows with scope: a tab appears only when its screen ships.

Scope is cut into **phases**, solo-first (H11). The app becomes complete for one person before anyone is invited: the founding constraint is that a user is complete with zero pools, and friends' onboarding is a one-shot resource that should not be spent on a build which has not yet proven it is worth opening daily.

*Mapping from the old labels, stated once:* v1a splits across P1 and P2; v1b's Lanes matrix moves into P1 and its Spotify suggestion into P1.5; v1.5 becomes P3. The v1a/v1b/v1.5 labels are retired.

## P1: solo-complete

| # | Session | Builds | Done when | Status |
| --- | --- | --- | --- | --- |
| S0 | Foundation | Repo, Tailwind tokens, full schema migration + RLS, typed clients, Google auth + profile bootstrap (timezone, category seed), shell (Home + Locker + FAB), seed fixtures | Fresh clone reaches signed-in empty Home in 10 min; RLS test proves locked ripples invisible to a linked friend | done |
| S1 | Wave system | SVG primitives in `components/ui/waves/`: wave line (drop), bundle (timed, log-scaled line count at constant gap), planned at reduced opacity, multi-ring commit ripple, travelling motion for in-progress, `prefers-reduced-motion` fallbacks, fixture page at `/dev/waves` | Every ripple state in the seed renders correctly, static and animated, and looks right against `_docs/mockups/` | done |
| S2 | Home Daily read | Ordered time axis (top = early), ripples placed by occurred_time, Daily Note area (several per day), date pager with author-tz boundaries, scroll anchors, duration chips, timeline exclusivity + inner ripples | Seed data renders as the mockup's Home Daily; anchors behave per SPEC 5 | done |
| S3 | Input sheet | Half-sheet with chips, single note field, segmented time toggle, audience chip, Drop / Timer dual commit, progressive landing rail, three entry points, running-session stop, collision surfaced as UX | A chip-only zero-character drop lands; the rail shows the ghost when the time is touched; a deliberate overlap is caught and named | done |
| S3.5 | Running record | Full-screen focus surface for a running timed (solid #0507C9, white travelling waves, elapsed at display size, stop behind a confirm, add-to-session entry); the now band on Home Daily replacing the plain running row | Starting a timer turns the row into the band; tapping it submerges into the focus screen; stop stills everything back into a finished bundle | done |
| S4 | Ripple mini sheet | Half-sheet on tap: note, time, media, lock state, inner ripples with their own entry point. **No view count** — that is P2, because it needs an audience to count | Tapping a ripple opens it; an inner ripple can be filed into its parent from here | done |
| S5 | Care | Hard delete including storage objects, photo attach + upload, final empty-state copy (empty day, empty Trail, empty Lanes) | Delete removes row and media; every empty state shows designed copy | done |
| S6 | Recall | Lanes matrix (my categories x days, locked included unmarked; tab appears now) with a lane's own edit sheet; Locker Trail (full personal scroll including locked ripples, date-sectioned, sinking sections per law 1) | A month of my own records is browsable by category and by day | done |
| S7 | Ship for one | Cloud Supabase promotion (slot from cleanup or second free org), Vercel deploy, OAuth redirect config, PWA-ish phone usability pass | during.today serves my own day from my phone | done |
| S8 | The Splash pivot (H20) | Home as one ordinal flow with ripple/splash modes; Splash boards (solo), the splash screen, lane inheritance, detach-on-delete; the ripple sheet and the splash sheet; ink-fill selection; six-lane preset; live-tracking surfaces dormant; exclusion constraint dropped | Note-only, photo-only and plain fragments from the FAB; a last-week annotation moves one; a laned splash from the tab bar inherits its lane; the board floats at the top of splash mode and its +Drop settles away; modes flip by toggle and by quiet mark without losing my place; the splash screen reads with photos large | done |
| S9 | The refounding (H21) | Ripples compose Splashes; Sessions (derived monthly shelves, custom shelves, the shelf view, the sessions sheet from the scrubber's `=`); Home as the blue water ground scoped by month with the lane header, the post grid, the scrubber and the pinned bar; the post's white page with in-place writing; the one post sheet; inheritance as defaults; delete cascades to blocks; the two-mode home, quiet marks, mode toggle, sheet pair and `+ with wave` retired | A titled two-paragraph post from the FAB plays the ring; a one-line untitled post; a post extended in place with a block dated last week surfaces in both months; a differently-laned block turns the lane into tags; a pinned post is reachable from the bar while scrubbed to August; September is titled from the sessions sheet; a custom session with two posts reads grouped by lane | done |
| S11 | Round 3 | The header (lane glyph, Lane \| Date toggle) and the Date view; six lanes at once with titles; lane pages with in-place rename; pinned cards; ripple threads; one axis per gesture; the way back to the same card; the Locker and Sessions retired; renamed Weming; two phone stack bugs fixed | Tap and swipe flip on a phone, gesture after gesture; a month reads as a grid and as a list of days; a lane renames from its page; a pinned card brings its post up; the back chip returns to the same card | done |
| S10 | Weming: grid + diving board (H22) | The rename (user-facing only); Home as the lane grid (lanes across, days down, a post a disc at its lane and day; sticky rail and headers in one two-axis scroller; even columns to seven, fixed past that) and the diving board (a staircase: read cards stepping up above the top card, unread stepping down below, one spring over the stack's depth on `motion`, the page turn kept behind a switch; the compose `+` beneath as the one entry); the halves linked by the ring; `?m=` as a scroll target; the Locker, the sessions sheet and the lanes sheet behind Home's menu; the tab bar, the FAB, the lane rows and the scrubber retired; a lane's emoji typed as one grapheme | The newest post is the top card and its mark ringed on open; flipping moves the ring and tapping a mark brings its card up; a drop marks the grid and lands on top; eight lanes scroll sideways under a fixed rail; Locker, Sessions, Lanes and new-lane all reachable from the menu and the headers; *Weming* in the title, manifest and package | done |

## P1.5: dogfood window

Daily personal use, small fixes, no new surfaces unless use demands them.

- First candidate: Spotify now-playing suggestion — client-side fetch when the sheet opens, one-tap prefill, no background jobs, no stored tokens.
- Quiet-day handling polish.
- An emoji picker for lanes, searchable in Korean and English. Today a lane's emoji is a plain one-grapheme field on the phone's own emoji keyboard (H22); the picker is its own task, not a tweak of that field.

**What this window can conclude (H11):** input cost and recall value only — whether a record is cheap enough to make, and whether the archive is worth returning to. **Solo usage decay is not evidence of product failure.** The witnessed hook is absent by design until P2, so its absence explains a decay that says nothing about the product with friends present.

## P2: the pool world (was Link)

**The P2 blocker is resolved by retiring Link (0023, 2026-10-23).** A linked friend could read every unlocked ripple of mine. Rather than scope that path, Link is retired: pools are the one way to share. Production held no links, so nothing had leaked; the links table and its rows stay, granting nothing. `tests/rls.test.ts` now asserts that a former linked friend reads nothing outside a shared pool.

- **Following someone is a pool of two.** The invite link, the friends strip with its live ring and elapsed time, and Realtime all run through pools, not links.
- **Discovery comes later, from Open pools** (see Later), not from a friend graph.
- The audience chip returns to the ripple sheet; Splash shared by two (H20d, H20g)
- Friend rail on the far right, sharing the time axis; Realtime updates when a friend drops
- View-count UI: opening a Ripple records a view event; the count is visible to the author only
- Presence TTL surfacing: 3d hardcoded, computed at read, expired members absent with no badge

**The witnessing experiment runs here.** 4 to 6 weeks with real friends, then SPEC section 1's hypotheses are reviewed against their decide-by signals (reaction migration, "who saw this?" asks, quoting friction, cross-day scroll requests, recording persistence). Decisions land in DECISIONS.md as group I before any P3 work begins.

## Pool phase 1 (H23, ahead of P2)

| # | Session | Builds | Done when | Status |
| --- | --- | --- | --- | --- |
| S12 | Pool phase 1 | 0009–0012 (pools, members, lanes, links, placements, joint splashes, invites; RLS; doors); create (1c) and lane matching (1d); invite links and `/join/[token]`; Home · Pool · + and the pool switcher; the pool's home in Lane, Date and Swimmers; joint splashes as bands with branches; the Audience chip and sheet; leaving | A member reads placed posts and not unplaced ones; a joint splash renders once as a band with a branch per ripple; Swimmers columns equal current members; an expired or revoked link opens nothing | done |

A pool whose creator's account is gone (`owner_id` null) cannot be deleted for now (0015); who may delete it then waits for roles. Not in this phase: a pool's kind — the create screen no longer asks it and nothing writes `pools.kind` (kept, nullable, unread); it may return as a template that prefills suggested pool lanes; open pools and search; roles and permissions on pool lanes; bulk placing my earlier records from a chosen date after joining; the follow feed; notifications.

## P3: Pool world, the rest (after the P2 review)

- Pool create + invite code; join screen = mapping privacy contract (pre-checked matches, residual categories unchecked, lurker join first-class)
- Pools tab (Lobby: my pools + join with code, activity ripple badges); tab appears now
- Swimmers (Daily time-aligned score view, Weekly person-column matrix, me-first + join order)
- Pool Lanes matrix; Home Lanes column headers become mapping dashboards
- Splash pool-wide (H20d): the compound pool pill, the joint ripples filter, the sharing record carrying `pool_lane_id`; participants on ripples
- Swim: FAB entry + lane long-press, live intruding card, focus screen = enlarged lane card + my timer, nothing more. **The dormant live modules (Timer, now band, focus screen, Break, inner ripples) wake here** (H20b)

## Next migration: Sharing model v2 contract (0036) — drop list

Destructive DDL waits for this migration, and each line needs Yoonji's explicit approval there, quoted in the migration and its commit (CLAUDE.md, "Data is real now"). The full list with reasons is `_docs/SHARING-V2.md` §3; these are the ones added since it was drafted.

| Drop | From | Why it goes |
| --- | --- | --- |
| `public.splash_reaction_summary(uuid[])` | 0030 | Fed the board's reactions badge, removed the same day (amends H25); the app no longer calls it |
| `public.splash_reply_preview(uuid[])` | 0030 | Fed the board's reply lines, removed with the badge; the app no longer calls it |
| `public.create_joint_splash(…)`, `public.splash_to_joint(uuid, uuid)` | 0011, 0022 (wrappers since 0033) | The old app's calls, kept through the 0033 window to make Everyone on; the new app calls `create_together_splash` and `splash_to_together` |
| `public.splash_to_pool_record(uuid)` | 0033 | Joint → pool record, retired before it was used: "Make it mine" is on Home only (0034) |

Until then each stays in the database, unread by the app.

## Sharing v2, after the switch

- **"Make it joint…" from Home** (SHARING-V2 §5, Home record edit sheet): pick the pool, a pool lane and Together without opening the pool. Today a Home record becomes joint from its edit sheet opened in the pool it is shared to. Needs each pool's members on Home.
- **Per-pool invitees on my records (0035)** (SHARING-V2 §7–8, H28): built, rehearsed, awaiting the push.
- **After 0035, what remains for sharing:**
  - the 0036 contract (drop list above, with quoted approval);
  - H24 release 2 (`ripples.category_id`), its own migration after 0036 is verified;
  - whether "Make it joint…" on Home is still needed now that the `…` menu offers it in a pool, and on Home for pool records.

## Queued (Yoonji, 2026-10-26), in this order after 0035

1. **Leave pool:** a member who isn't the pool's creator gets "Leave pool" where "Delete pool" is.
2. **Layout:** move a record's whole position on the Y axis, not only its label.
3. **Theme colours:**
   - yellow closer to yellow;
   - lime, sky and pink lighter, and all less muddy;
   - keep 3:1 against white text: a shade that fails is shown beside the nearest passing one, not shipped.
4. **Splash detail:** an optional description on a splash, added above the divider when tapped.
5. **Saved toast:** a change that applies without Save, such as the theme colour, shows a success toast.
6. **Bob z-order:** stacking is wrong while cards bob.
7. **Layout's stacking:** put stacking order on the position slider, with a label a non-developer reads, not "z-index".

## Later, unscheduled

Home Weekly zoom; one year ago today; background auto-collection (timeline autofill; Spotify first); Lists UI and multi-pool routing settings; notifications (Splash opened / Swim started / Link request only, max 2/day); Splash-born ephemeral pools; open/searchable pools; desktop score layout + ambient window; couple weekly grouping on Splash; recurrence engine; note-convention parsing; photo book export; dark mode (night pool); TTL setting UI (instant/1d/3d/7d).

- **A Content Security Policy for pages** (Yoonji, 2026-10-27): today only `/sw.js` sends one. Plan it as its own change — report-only first, then enforced — covering Supabase, Sentry, youtube-nocookie.com (the player's frame), i.ytimg.com (thumbnails) and our own assets.
- **A single photo between the label and the other photos** (H34): photos are drawn as one layer at their top photo's rank in a post's order; place each photo on its own only if people ask.

## Standing rules

- A phase's list never grows mid-session; new ideas go to "Later, unscheduled" or to DECISIONS.md.
- Any schema change after S0 is one migration with a one-line rationale in the commit.
- Hypothesis features (reactions, viewer lists, chat) are not built even if requested casually during a dogfood window; they wait for the P2 review.
