# Weming: Product Spec (v0.24)

> A one-line diary that assembles itself. While you write it, your presence shows on the surface for a few close friends.
>
> **The hand throws moments at stories; the machine shelves them in time.** (H20)
>
> **Blog structure, without blog cost.** A post is a title and some blocks, extended over days; a one-line post is a complete post; the month shelves it. (H21)

Domain: during.today. UI language: English. First users: 1:1 friends (most general case), then couples and church small groups via Pools.

The reward loop: **being witnessed is the hook, the personal archive is the retention.** Records are written for oneself; sharing is a side effect (a leak, not a broadcast).

Revision notes: v0.2 dissolved the former "Non-negotiables" section (product prohibitions became MVP hypotheses; system rules moved into their operating sections). v0.3 applies H6 (v1 restructured into v1a/v1b) and H7 (palette mid tone corrected to #787BE2). v0.4 applies H8 (#787BE2 scoped to chip foregrounds and the wave ramp; law 5 split into content surfaces vs interactive chrome). v0.5 applies H9 (wave tone deleted; law 4 narrowed to ropes and empty slots; the commit ring becomes a multi-ring ripple). v0.6 settled H9's open item (an in-progress timed travels; grow deleted). v0.7 applies H10 (timeline exclusivity and inner ripples). v0.8 corrects section 5.4: the axis is ordered, not time-proportional (H16). v0.9 applies H12 (the ghost lands on a compressed axis inside the sheet). v0.10: inner ripples are created from the parent Ripple's detail sheet, not the input sheet. v0.11 applies H13 (the landing rail is progressive; time is a segmented toggle). v0.12 applies H14 (law 1's sinking is scoped to sections within a scroll; a paged day keeps its ground). v0.13 applies H11 (scope re-cut into solo-first phases; v1a/v1b/v1.5 retired). v0.14 applies H15 (a running record gets a now band and a focus screen; solid #0507C9 means a live session; wave colour is contrast-determined). v0.15 adds Break to H15: a timed inner ripple; the parent session keeps gross duration and no net time is shown. v0.16: the focus screen carries the deep wave preset and hosts the sheet as an overlay; inner composition is Drop-only. v0.17 reverses calm-water rendering; a break inherits its parent's category rather than having one of its own. v0.18 applies H17 (the Ripple detail sheet; edit is the input sheet; hard delete takes its media and its inner ripples). v0.19 refines H17: a finished record's end is correctable, and the Daily Note prompt opens the sheet with no time. v0.20 applies H18 (kind is end-presence at the input surface too: a typed span makes a timed Ripple, and the present is written by the Timer). v0.21 applies H19 (the Lanes matrix and the Locker Trail ship; law 1's sinking finds its first consumer in their month sections; the empty-state voice is fixed). v0.22 applies H20, the Splash pivot: the record unit is a story fragment; identity is record/retrospect and live tracking goes dormant; Splash is promoted from P3; the exclusion constraint is dropped; ink fill means selection and blue fill means action; six default lanes. **v0.23 applies H21, the refounding**: During becomes a compact blog-form diary on the water ground. Ripples compose Splashes (a block inside a post); Sessions are shelves — monthly ones derived, custom ones made; Home is the blue ground scoped to one month; a post is read and written on its own white page; a declaration (date, lane) is a default, never an override; deleting a post deletes its blocks; the two-mode home, the quiet marks, the mode toggle, the sheet pair and the tab bar's `+ with wave` retire. v0.24 (H22) renames the product **Weming** and rebuilds Home as two linked halves — the lane grid (lanes across, days down) and the diving board (the newest posts as a stack of cards) — retiring the lane rows, the month scrubber, the tab bar and the FAB; the Locker, the sessions sheet and the lanes sheet move behind Home's menu.

---

## 1. Design hypotheses (ship the MVP without these, then confirm or revise)

Rationale for the demotion: a document's authority should come from rationale, not labels, and the asymmetry favors testing. Adding these later is cheap; removing them once shipped is nearly impossible. Shipping without them IS the experiment.

| Hypothesis (MVP ships without) | Decide-by signal |
| --- | --- |
| No likes, comments, rankings, streaks, follower counts | Reactions migrating to KakaoTalk = intended division of labor. Recording volume decaying = witnessing alone under-rewards. |
| Witness signal is a view count only, never a viewer list | How often "who saw this?" gets asked directly. |
| No chat: no threads, no reply chains; Splash logs flat, quoting one level max | Whether one-level quoting is reported as cramped, and whether conversation stays comfortably in KakaoTalk. |
| No feed: Home is one month of **my own** posts on the water, oldest at the top and today at the bottom; nothing anyone else wrote ever arrives on it (H19, H21) | Whether the ground gets read as a feed once friends exist in P2. |
| No guilt devices: no streaks, no red gaps; unchecked plans fade quietly, empty days pass silently, empty states read as invitations | Whether recording persists without reinforcement. Habit requests are served by suggestion-row re-drops first. |

## 2. Vocabulary (fixed, do not rename)

| Term | Meaning |
| --- | --- |
| **Ripple** | A **content block inside a post** (H21a): a paragraph, a photo, a line — a story fragment with a voice (H20a), shelved in time by the system. Two kinds remain: **drop** (a point, no duration claim) and **timed** (a block *with a span*, the only kind that shows duration); kind is end-presence, not provenance (H18). **A block inherits its post's lane and date (H24)** and has no lane of its own, ever: it is placed wherever its post is. On a post with a range it may carry its own day inside it (0031), shown and ordered only in the post's detail. An older block's own date, time and lane stay as frozen metadata, shown where they were and used for nothing. Every block belongs to a post; one whose post I can no longer read (a joint splash of a pool I left) reads as an untitled post of one. *Dormant (H20b):* the Timer, the running record, and **inner ripples** (`parent_ripple_id`) — the modules stay for P3's Swim; no surface offers them. |
| **Splash** | A **post** (H21a): a title (optional), some blocks, its date range and its lane. Ripples compose it: a block belongs to exactly one post, and deleting the post deletes its blocks. A post **owns** its range (a date, an optional end date) and its lane — my lane, or its pool lane for a joint or Just-mine splash — and every block takes both (H24). A joint splash shows on my Home in my lane its pool lane is brought into (↔ both, → in), else in the pool's column, derived from the link. A post may be **pinned** (H21g) and may belong to at most one custom Session. Solo in P1; shared by two in P2; pool-wide in P3. |
| **Session** | A **horizontal shelf of posts** (H21e), one stint in the water. **Monthly sessions** are derived from the calendar — every month is one, a row exists only once it is titled — and a post appears in every month its display range touches. **Custom sessions** are made: a title, an optional declared range, an optional lane; a post sits on at most one. The old tracking sense (a running timed record) is retired. |
| **Swim** | A live quiet co-presence session. Per-person lanes numbered by join order; the last lane is always an empty "your lane" slot acting as the invitation. |
| **Pool** | A **group space**. Explicit membership. Home of shared artifacts. Unbuilt in P1 (a reserved seat). |
| **Lobby** | The pool browser screen (my pools, join with code). |
| **Lanes** | The **topic axis through all time** (H21a). Top level: my categories. Inside a pool: that pool's categories. A lane is a division of the water; the category is what the division means. On Home the lanes head the ground and filter it, and the last slot of that row makes a new lane: this is the lanes view. The matrix (the former Lanes tab) is dormant until P3's pool Lanes. |
| **Swimmers** | A pool's people view. Daily zoom: time-aligned score view. Weekly zoom: person-column matrix. |
| **Locker** | My private global archive and recall engine. Outside any pool. Sees everything, including locked drops. |
| **Submerge** | Presence expiry. Per-user TTL (default 3 days; options instant / 1d / 3d / 7d). Expired members disappear from rosters entirely (no "submerged" badge). Past Ripples persist; only "presence" expires. |
| **Link** | Mutual friendship. The only kind; no asymmetric follow. |
| **List** | My private labels over Links, used for audience routing. Never visible to others. |

Retired vocabulary (do not reuse): Stream, Deck, Pan, Table, Event, Moment, Log, and **Session in the tracking sense** (H21a). **Thread** is banned as a UI noun: it collides with the no-chat hypothesis (section 1). "Post" and "block" are descriptive prose for a Splash and a Ripple, never identifiers. The ground has no name of its own — it is just **Home** (H20d).

## 3. Social graph

- **Link is always mutual.** No follower asymmetry, so no audience accumulation.
- **Pool membership is independent from Link.** Groupmates need not be friends. Never join these tables to imply friendship.
- Two visibility paths for a Ripple:
  1. **Link path:** my rail appears in my friends' Home (subject to List routing).
  2. **Pool path:** only what is mapped/leaked into that pool, visible to all members including non-friends.
- A non-friend pool member's profile is a dead end: only their in-pool Ripples + a Link request button. Never a gateway to their full timeline.
- Lists are the answer to "send to friend-group A and B at once". Routing asymmetry (I show you more than you show me) is acceptable and undetectable by design (no view lists, no membership visibility).

## 4. Leak model (routing) and category rules

- Records are made in Home ("a dot on my Trail"); pools receive them by **leak**, not by publish.
- **Explicit mapping is the precondition of any leak.** my_category to pool_lane. No name-match auto flow (identical names in different pools are different contexts).
- Pool join screen is a **privacy contract**: "these things will flow into this pool." Suggested mappings for matching names come pre-checked, **except residual categories (e.g. Day), which default unchecked.** When a residual category is about to be mapped, nudge toward creating a dedicated category instead.
- Zero mappings = lurker membership. Fully valid, no warning copy, CTA adapts ("enter without connecting").
- Per-drop override: a small audience chip on the input sheet. One spectrum: everyone, selected lists/pools, only me (lock). Lock is not a separate toggle. **Absent in P1** (H20g): no audience exists solo, so fragments default to Everyone and the lock toggles in the detail sheet; the chip re-enters the sheet at P2.
- **Lane membership is per-space and derived** (H20h): a Ripple keeps one personal category; pool-side lane assignment lives on the sharing record (the P3 join table carries `pool_lane_id`), never as an array on the fragment. Detach ends the pool-side membership.
- My category names are mine; pool lane names are the group's. Mapping connects them without forcing shared vocabulary.
- Locker always contains everything. TTL governs presence only.

**Category axis rules (system rules, embodied in the schema):**
- Categories answer only "what". "With whom" = participants. "When" = the page and time fields. "To whom" is not a category (a future marker at most).
- One event may produce several Ripples; category assignment is per Ripple, never per event.
- Structured-data ambitions (scores, distances) go into note conventions, never into schema fields.

## 5. Information architecture

**Top level (round 3):**

```
Home (Lane | Date) + compose (white disc, blue +) · a lane's page · a post's page
```

At the foot of Home and of a pool: **Home**, whose every tap on Home switches the view, Lane to Date and back (the toggle follows); **Pool**, which opens my most recently viewed pool (per device), or the list with *Open a new Pool* when I belong to none; and the compose disc (H23). No Locker. The Locker and Sessions are retired as surfaces (round 3): the grid, the Date view and the lane pages cover retrospection. The `sessions` table and its migration stay; nothing reads them. Friends are a reserved seat: no entry, no dead button. 
- **Home: the water ground** (H21c, H22, round 3). Layout authority: `_docs/mockups/home-grid-stack.png` (the solo frame). One solid `#0507C9` surface in **two linked halves**, inside the dynamic viewport and the safe areas. On blue ground the colour channels invert: white carries content and action, ink stays selection. Opened plain, it stands at today with the newest post on top; `/?m=YYYY-MM` opens scrolled to that month with its newest post on top; `/?top=<id>` opens with that post on top — where a post's page sends Home back to — and a bare `/` reached by the back button finds the card that was on top in this tab.
  1. **The header**: the lane glyph at the left opens lane management (the lanes sheet: icon and name in place, reorder by grip, delete behind a confirm); a segmented toggle **Lane | Date** at the centre, the selected segment white with blue words, remembered per device. No settings page exists, so no gear.
  2. **Pinned posts** as cards under the header and above the grid or list: white at 20%, rounded like the stack's cards, in three lines: the lane plainly (its emoji and name, no chip), the title large so size carries the contrast, then the author's initials on a disc beside the latest ripple, truncated. One card wide; with several, a horizontal snap scroller with the next card peeking at the right edge. A tap brings that post to the top of the stack, the grid or list scrolling to it with the ring. Unpinning is in the top card's menu. Absent when nothing is pinned. On a wide screen the cards sit above the stack on the right — both slots are rendered from the server and a media query shows one, so they are in place from the first frame.
  3. **The Lane view** (the grid): a large centred avatar (initials) scrolling away with the days; one **column per lane** in the author's order, headed by the emoji over the name — **a header opens the lane's page** — a thin low-contrast **rope** beside each lane, never through its marks, none at the rail's side of the first lane; a narrow `+` column after the last lane opens the new-lane sheet. A fixed **date rail** at the left, newest day at the top, the day number and weekday, the year and month only on a month's first named day, at one quiet opacity (white/70). **A post is a white disc carrying its lane's emoji** at its column and day; several on one lane and day stack 4px apart and the row grows; every day row is at least 56px. **At most six lanes show at once** (`EVEN_COLUMNS_MAX`): with six or fewer the columns share the width and the group is centred; from the seventh each column keeps a sixth of the room and the columns scroll sideways under the rail and headers. **Every mark carries its short title beneath it** (10px, two lines at most, centred, ellipsised). **A run of empty days compresses to one short gap** with no date. One scroll container, both axes, the rail sticky left and the headers sticky top.
  4. **The Date view**: no lane columns. The same rail, scroller, window, `?m=` target and ring; under each day, that day's posts as **rows**, one per line, full width — the icon on a disc, the title, the lane as an outlined chip — newest first, with **no pill background**, separated only by a faint white line; the row of the card on top is at full white on a white disc, every other row sits back; **every day is spaced alike** — no gap rows for empty days, the month on a line of its own above its first day rather than a taller rail, the day number aligned with its first row, one fixed space after each day; the grid's empty-day gaps are not drawn here. The row of the post the stack is heading to carries the ring; a tapped pill comes to the top; a post just dropped puts its pill under today with the ring. The stack is shared and does not change between views.
  5. **One axis per gesture**: the grid is two scrollers, an outer one that moves only up and down (the avatar, the sticky header bar, the days) and an inner one that moves only sideways (the columns, the rail sticky at its left), so a drag latches natively to one axis, momentum included; the header bar follows the inner's sideways scroll. The first-8px lock holds the other axis on both scrollers and on the pinned strip as well; the stack decides the same way.
  6. **The diving board**: a staircase in both directions (see below), the compose disc — white with the blue `+` — at the bottom right outside it.
  7. **The halves are linked**: the ring plays at the mark or pill of the card the stack is heading to — from the moment a flip is committed to, not once it lands — and at a drop's, the grid scrolling first if it must; that mark is the one solid mark, every other translucent; tapping any mark, pill or pinned card brings that card up.
  8. **Empty ground**: one gap of empty ropes, no stack, the compose disc alone.

  **The staircase.** A flip settles in about a third of a second (a stiffer spring, 520/42, called settled as soon as the eye cannot tell), and a tap or swipe during a landing moves on rather than waiting it out. The top card is the current step, read in full: the emoji with the title at the detail title's size, the date with its weekday and the lane chip, then its ripples as a thread (see a post's page). Unread cards step down below it by 26px, smaller by 0.94 per step, three at most; the one card read last steps up above it by 22px, frosted, a bookmark; earlier read cards are reached through their marks. Flip forward slides the top card up a step and raises the next; flip back is the reverse; one spring (300/30) over the stack's depth moves every card. On a phone a tap anywhere in the lower stair brings up the next card (the bands are too thin to aim at), a tap on the upper card brings it back, and a swipe up or down on the top card flips either way; a swipe during a landing finishes it and moves on, so swipes chain. Sideways on a wide screen the read card sits left and the unread fan right as 44px book spines, the top card widening into any slot not in use; a spine's click brings its own card, the arrow keys flip. The top card carries a `…`: Open, Pin or Unpin, Delete behind a confirm. Reduced motion crossfades.
- **A post's own icon** (0008): an optional glyph that stands for the post before its lane's emoji — on its mark, its pill, its card's title line and spine, its pinned card and its row on a lane page. Set in the post sheet beside the title and in place on the post's page, a one-grapheme field on the phone's own emoji keyboard, shown large; left empty, the lane's emoji stands in. The column holds at most 16 characters; the one-grapheme rule is the app's.
- **A lane's page** (`/lane/[id]`, round 3): a breadcrumb, *Home / the lane*; where Home has the avatar, the lane's emoji large with its name under it; then every post on the lane in **the Date view's own day list** — the day number over its weekday on the rail, the month on a line of its own, the icon and title, no lane chip (every row shares it) — newest first, no pill background, faint white lines between; **Home's card stack over the lane's posts sits at the foot of the page**: the row of the card on top is at full white, every other row sits back, a row brings its post to the top, and the top card opens the post's page, which comes back here with the same card on top (`/lane/[id]?top=<id>`). Tapping the emoji or the name edits them in place (the emoji as a one-grapheme field, the name as text) with Save and Cancel, shown at once. Deleting and reordering stay in lane management, linked at the foot (*Manage lanes*).
- **A post's page** (`/splash/[id]`; "the splash detail", H21c): a **white full-screen page sliding over the ground**, not a sheet. A back chip top-left in blue text names where it came from: Home (which opens with this post on top again), a month, or a lane page by its emoji and name (*← 🎬 Media*). Header stack, left-aligned: the lane tags (declared first, outline chips), the title at display scale, the date range small below (declared, else derived), and a wave underline under the title sized to the block count. Blocks below in time order, **oldest first**, one column at content width (on a wide screen the header keeps the left half and the blocks read down the right): a small muted date label, the body at reading size (15–16px, line height 1.6–1.7), photos at full content width with rounded corners, generous space between blocks and at most a hairline between them; no avatars, no cards. **In-place editing, blog-editor style, no sheet here**: tapping a block puts the cursor in it (Cancel / Save per block, Delete, the lock toggle — Everyone / Only me — beside them); an add slot at the bottom (*Drop your words here*) starts a new block directly on the page, defaulting to the declared date and lane (H21f) with `+ Add Time` to annotate otherwise and `+ Add Image` inline. The title and the declared date and lane are edited in place from the header; **pin / unpin**, the **session** assignment and **Delete** live in a quiet header menu. Delete deletes the post **and its blocks**: the confirm says *deletes the post and its N blocks* (H21, the reversal). A ripple with no post opens as an untitled post of one block and gets a row of its own the first time it needs one. **Each block is an entry in a thread** (round 3): the author's initials avatar at the left, the body indented beside it, and a thin 1px line (`pool-200`) from one avatar down to the next, stopping at the last; one block is an avatar and no line; the block's date label sits beside its avatar.
- **Lanes matrix** *(dormant since the refounding review: the tab retired because Home's lane header is the lanes view; the module stays for P3's pool Lanes)*: my categories x days matrix (wave cells). Includes locked blocks, unmarked (this view is mine alone). Column header = that category's dashboard: edit name/icon and delete while empty, plus where it flows — mappings — which arrives with pools in P2.
  - **A cell is a count, drawn as an impression** (H19): how many blocks that category held that day, log-scaled and capped, never a number. A day is the block's post's day (H24). **Future-dated blocks are not counted**: the day has not happened. Sections are months, sinking per law 1 as the scroll goes back.
  - **Quiet stretches fold**: three or more consecutive days with nothing recorded collapse into one low row (`Sep 2 to 6`). The threshold is tunable. The matrix is otherwise unbounded — today back to the first record — because the fold is what makes that affordable.
  - Interactions, two: a cell opens that day's month on Home, a column header opens that lane's sheet. Deleting a lane that still holds records is refused rather than resolved.
- **Pools**: room list with activity signals (ripple badges on pool cards: active Splash bar miniature, Swim traces). Lobby = browse my pools + join with code. No public search / open pools in v1. *Reserved; P3.*

**Inside a pool:**

```
Swimmers / Lanes / Splash
```

- **Swimmers**: the room's daily screen. Daily zoom: time-aligned score view (per-person vertical lanes, me first, then join order). Weekly zoom: person-column matrix. Quiet members within TTL show as calm columns; past-TTL members have no column.
- **Lanes**: this pool's categories x days matrix.
- **Splash**: boards + **all joint Ripples (participants >= 2)**. The "records of us together" filter; ended Swims are absorbed here as joint-Ripple bundles. For couples this tab is effectively the shared album.
- **Swim has no tab.** Start: FAB sheet (secondary entry) or long-press on a lane. Live: a large intruding card wherever relevant (carousel peek if multiple). Past: a record card on that day's page + traces in Swimmers (simultaneous bundles).

## 6. The post sheet, and writing on the page

**One sheet, for new posts only** (H21). Every later word is written on the post's page (section 5). No mockup this round: the geometry below is the authority, built in `home-ground.png`'s visual language.

**The post sheet** — from Home's compose `+` (H22). **On a wide screen** (review, 2026-10-22) the sheet is the same composer, from the compose disc; the standing composer and the Trail beneath it are retired, and Home's two halves sit side by side — the grid (or whichever view is chosen: Board, Lane, Date, a pool's Swimmers) left at two thirds of the width, the board right at one third (review, 2026-10-26), the board's column as tall as the screen and the top card growing with the room (its box measured, the lower stair's steps taken off, the rest the card). Beneath the card, in a card of its own, **the Locker's Trail**: a wide screen has no Locker tab, and the archive reads under the writing; a row's post page points back to its day's month on the ground. My own records, never a feed: nothing anyone else wrote arrives there (A1, H19).
- A bottom sheet on the dimmed blue ground, white, content-column width on desktop (the shared max-width token). **Two fields, one rule** (review): the title field, large, bold and blue (#0507C9), placeholder *Drop your splash*; beneath it the body field, smaller and lighter, placeholder *Enter the content*. Enter in the title moves on to the body, so the first line is still the title and everything after it is the first block's body. The sheet grows with its content to near-fullscreen, capped at the safe area.
- Below the text: the **lane chip row** — the declared lane; horizontally scrolling; a search field past **8** lanes (a constant); selected = ink fill (law 5). The date chip, **preset to today** when the sheet opens (review): **the post's own date** (H24) as one removable chip that is also the editor — days only, no clock, an optional end date; its × leaves the post on today. `+ Add Image` — camera or gallery; thumbnails preview above the commit row. No session field: sessions are date-based (review), and a custom shelf takes a post from its own picker or the post's header menu.
- **Commit row**: a single full-width **Drop**. Blue means action; the Drop is the one blue thing on the sheet.
- **A line in the content alone commits as an untitled post** whose line is its first block: the dump posture is preserved (a judgment call on dogfood review). A title alone commits as a titled post with nothing in it yet — never as an untitled block (review, 2026-10-04). Text-only, photo-only and chip-only commits are valid; nothing at all is the one thing that is not.
- After commit the sheet closes and the **ripple ring plays once at the new post's pill** on the ground — transform and opacity only, no ambient loop, skipped under reduced motion: the signature moment. The pill is seated the moment Drop is pressed, before the server has the post (every edit, add and delete is optimistic; CLAUDE.md). No praise, no share prompts.

**Writing on the page** (section 5, the post's page): tapping a block edits it in place; the add slot at the bottom starts a new block; the title, the post's date and its lane are edited in place from the header. A block has no lane to choose: it takes the post's (H24). On a post with a range a block has a day chip, "Oct 8", whose picker offers only the range's days — today when inside it, else its last day — and the blocks read by day (undated ones at the start), then as written; elsewhere they read as written (0031). A range edit that would leave a dated block outside it is refused: "Some entries are dated outside this range." When a one-day post is widened into a range, a block's older frozen date inside the new range becomes its day; one outside it is ignored and the block reads as undated.  Not editable anywhere: `created_at` (H17).

*Retired (H21):* the ripple sheet, the splash sheet, `+ Add to Splash`, the ripple detail half-sheet (the lock toggle lives in the block editor now, H20g's intent kept: audience sits beside the record where it is read). *Dormant (H20b, H20c):* the Timer and the dual commit, the running-session swap, the straddle refusal, the ghost landing rail, inner composition, the collision repair, and the old ripple sheet the focus screen hosts. Their modules and tests stay for P3's Swim.

## 7. Visual system

Theme: swimming pool. Stop before skeuomorphism: no wave textures, no floats, no water puns in copy.

**Laws:**
1. **Time owns the tone and opacity channels.** On the ground, **time reads down the grid**: the newest day at the top, older days below, each lane a column (H22); the bottom edge stays the present-and-writing zone — the stack of the newest posts and the drop bar. **The past recedes as the grid scrolls down** into earlier months; the ground itself does not sink. On the white continuous scrolls (the Trail, Lanes) backgrounds still sink stepwise (white, then #F1F3F7, then #D8DCE8) going deeper as you move back through one surface; a paged view is not a section and keeps its ground (H14). Tone and opacity never encode ownership (mine vs others).
2. **Undulation = activity.** More waves = more happened. Impression-level (calm / some / lots), log-scaled, never a precise count or a participation gauge. A bundle's count is an impression and nothing finer: it does not represent breaks or any other structure inside a session, because information below an encoding's resolution reads as a defect (H15a2).
3. **Only living things move.** An in-progress timed **travels**: its waveform is held rigid and slid through a clipped window, every line in the bundle in phase, so what moves is the water and not the drawing of it (H9). Finished water is still. New drop = a **ripple: three rings spreading outward, staggered**, their opacity front-loaded against their travel (H9c) — one event per commit, never a loop. **One stated exception**: the ghost ring at the head of a list ripples continuously — the invitation is the one still thing that moves, because it is the seat of the next living thing. reduced-motion fallback mandatory, and every design must read correctly static.
4. **Dotted = not yet.** Lane ropes and the empty "your lane" slot. **Not planned Ripples** (H9b): at the wave's 1px amplitude a dashed stroke becomes a row of dots and stops reading as a wave, so planned renders at reduced opacity instead.
5. **One channel, one meaning.** Position = me (first column/row, leading). Ring weight + #0507C9 = live. **Two fills, two meanings (H20f): solid #0507C9 fill = action** — Drop, +Drop, the compose `+`, waves; **solid ink #161621 fill = selection** — the selected chip, the selected lane header, the pinned bar. White text on both. The Sessions tab's current month reads in #0507C9 text, no fill. **On the blue ground the channels invert (H21c)**: Home's ground *is* solid #0507C9 — the water, not a session — so white carries content and action there (post marks and cards, waves as data) and ink stays selection; the live-session meaning of a solid #0507C9 *content* surface is kept only by the dormant live surfaces (H15). Blue fills on a white screen point only at what commits or creates. Chrome styling is not encoding, so the action colour does not compete for the channel (H8).
6. **Vocabulary may be taught; visual encodings may not.** If an encoding needs explanation, it is rejected.

**Palette (the only custom tokens):**
- Main ramp: **#0507C9** is the whole of it in practice — waves, live states, emphasis text and interactive chrome. **#787BE2** is a chip foreground only (H8). **#D3D7F6** is **reserved and currently unused** (H9a): the wave vitality ramp it belonged to no longer exists, because a wave keeps its strength wherever it sits and the past is carried by the sinking background instead.
- Gray ramp, structure: **#F1F3F7** surfaces, **#D8DCE8** deeper surfaces / dividers / lane ropes, **#6B79A3** muted and secondary text.
- Ink: **#161621** body text (retokened from #313338 at the refounding review).
- **Text rule (H8):** #787BE2 is a **chip foreground and a wave tone, nothing else**. Its only text use is the foreground of small tag-like chips (the duration chip); otherwise it appears solely as the "recent" tone inside the wave ramp. Text hierarchy: **#161621** default, **#0507C9** emphasis, **#6B79A3** muted or secondary. #D3D7F6 is never text. Enforced by `scripts/check-tokens.sh`, which fails the lint if main-400 is used outside the chip and wave components.
- **Chips (H20f):** a category chip is white with muted text when unselected and an **ink fill with white text** when selected; an outline chip (a splash's lane chips) is never filled. Blue fill is never a selection.
- **No other colors, with one exception: category emojis keep their native colors** (the only off-palette element).
- Dark mode: undefined for now. When designed it must be a night pool, never inverted colors.

**Wave colour is contrast-determined (H15c, generalised by H21c):** #0507C9 on light surfaces, white on the blue ground. An inversion rule, not a second tone — one wave drawn in whatever reads against its ground, carried by `--wave-ink` so the surface decides and the component never takes a colour. A white pill on the ground sets it back to blue inside itself.

**Ripple grammar:** timed = multi-line wave bundle (line count log-scaled on duration, capped at 10; **constant gap between lines, so only the count varies** — a bundle's height is a consequence of its density, not a measure of its span). drop = single wave line. A post's **wave mark** = its block count on the log scale (law 2), drawn inside a ring at the pill's right end; its page carries the same count as a wave underline under the title; a lane header's waves are its post count this month. A post with nothing in it yet draws one line so it has a mark at all. Planned-at-reduced-opacity is retired (H20c): a future-dated block is a normal block with a future date chip. Category badge on the avatar corner (rows) or bundle head (timeline), so text is 100% note. Display format: `category · note`.

**Design system follows Tailwind conventions:** spacing, radius, and type use the default scale; the three ramps above are the only custom tokens.

## 8. Data sketch

```
users
links(user_a, user_b)                     -- mutual, single row
lists(owner), list_members(list, user)    -- private labels
pools(ephemeral, born_from_splash?)       -- reserved flags
pool_members(pool, user)                  -- independent of links
pool_lanes(pool, name, icon, order)
my_categories(user, name, icon, default_mode drop|timed)
lane_mappings(user, my_category, pool_lane)   -- the plumbing
ripples(author, category?, note?, media[],    -- a block (H21a); category frozen (H24), dropped in a later release
        occurred_on? date, occurred_time?,    -- occurred_on: its own day, only inside a range post's range (0031);
                                              -- elsewhere, and occurred_time always, frozen metadata (H24, 0029)
        started_at,                           -- frozen with occurred_* (H24)
        ended_at?,                            -- frozen with occurred_* (H24): an older block's span, read back
        splash_id,                            -- the post this block composes, always (H24); ON DELETE CASCADE (H21)
        parent_ripple_id?,                    -- dormant (H20b): inner ripple, contained by its parent's span
        planned bool,                         -- dormant (H20c): always false from the sheet
        participants[], created_at)
  -- H20c: the exclusion constraint is dropped; overlapping spans are legitimate records
ripple_audience(ripple, target: list|pool|lock)
ripple_views(ripple, viewer, viewed_at)       -- witness counts; readable by the ripple's author only
ripple_reactions(ripple, user, emoji)         -- H25: one of each emoji per person; whoever can see the ripple; none on a locked one
ripple_replies(ripple, author, body 1-500,    -- H25: not a ripple (no lane, no date, never on the board); one level;
               edited_at?, hidden_at?,        -- hidden by the ripple's author: its text reaches only its writer and that author;
               hidden_by?)                    -- hard delete; read and written only through functions (0030)
splashes(owner, title,                        -- a post (H21a); owner-only RLS
         declared_start, declared_end?,       -- its range, which every block takes (H24); never null (0029)
         declared_lane_id?,                   -- its lane, which every block takes; required on a personal post (0029)
         icon?,                               -- the post's own glyph, ≤16 chars (0008)
         session_id?,                         -- at most one custom session; on delete set null (H21e)
         pinned_at?,                          -- H21g
         pool?, type free|prompted, prompt?)  -- pool-side seat, reserved for P3
sessions(owner, kind monthly|custom, title,   -- a shelf (H21e); owner-only RLS
         month? date,                         -- monthly: the first of the month; unique per owner; a row only once titled
         declared_start?, declared_end?, lane?)   -- custom only
```

occurred vs created separated (backfill lands on the right day); occurred_on and occurred_time are author-local, day boundaries computed in the author's timezone. **A post is placed by its own range alone (H24)**; within it, blocks read in the order they were written. A block's `occurred_*` fields are frozen metadata (0029), never written again. Monthly session membership is derived from a post's range and never stored (H21e). Swim = a grouping of simultaneous timed Ripples. RLS enforces the two visibility paths at the DB level.

## 9. Scope

Scope is cut into **phases**, not versions (H11). The build is solo-first: the app becomes complete for one person before anyone is invited, because the founding constraint is that a user is complete with zero pools and the archive is worth keeping with nobody watching.

*Mapping, stated once:* the old v1a splits across **P1** (everything except the social half) and **P2** (Link, rail, view count, presence). Old v1b's Lanes matrix moves into P1; its Spotify suggestion into P1.5; Home Weekly is deferred. Old v1.5 becomes **P3** unchanged. The v1a/v1b/v1.5 labels are retired.

**P1 — solo-complete.** Auth (social login) + profile bootstrap (timezone capture, six-lane seed); **the refounding (H21)**: the post sheet (section 6); Home as the water ground scoped by month; the post's page with in-place writing; Sessions (derived monthly shelves, custom shelves, the shelf view, the sessions sheet); pinned posts; inheritance as defaults; delete (hard, including media and blocks); photo attach; designed empty-state copy; Locker Trail (full personal scroll including locked blocks); deploy to cloud Supabase + Vercel, because daily use on a phone requires it. *Dormant, kept for P3:* the Timer, the now band, the focus screen, Break, inner ripples.

**P1.5 — dogfood window.** Daily personal use and small fixes. First candidate: Spotify now-playing as a client-side fetch when the input sheet opens — no background jobs, no stored tokens.

**P2 — Link world.** Link + invite link, friend rail, the audience chip back in the sheet, **Splash shared by two**, view-count UI (opening a Ripple records a view event; the count is visible to the author only), presence TTL surfacing (hardcoded 3d, computed at read). **The witnessing experiment runs here**: the section 1 hypotheses about being witnessed are not answerable before an audience exists.

**What each phase can conclude (H11).** P1 and P1.5 validate **input cost and recall value only** — whether a record is cheap enough to make, and whether the archive is worth returning to. **Solo usage decay is not evidence of product failure**, because the witnessed hook is absent by design until P2.

**P3 — Pool world.** Pool create/join + mapping contract screen, Swimmers (Daily score / Weekly matrix), pool Lanes, **Splash pool-wide** (the compound pool pill, the joint filter, the sharing record carrying `pool_lane_id`), Swim (lane card, live card, FAB entry — the dormant live modules wake here), suggestion row full version.

**Later, unscheduled:** Home Weekly zoom, one year ago today (empty by definition for the first 12 months), background auto-collection (timeline autofill; Spotify first), multi-pool routing UI (category x pool mapping settings), Lists UI, notifications (Splash opened / Swim started / Link request only; <= 2/day), Splash-born ephemeral pools, open/searchable pools, desktop score layout and ambient window, weekly-group view for couples (Splash grouping), recurrence engine, note-convention parsing (scores), photo book export, dark mode (night pool), TTL setting UI.

### 5.8 Empty states

One voice: **invitation, never absence, never a nudge** (H19). No exclamation marks, no counts of what is missing, no "yet" that implies a debt. An empty month on the ground has no copy at all: every lane row with an empty rope is the invitation (2026-10-05). A shelf with nothing on it: *Nothing shelved here.* Lanes with nothing recorded at all: *Waves gather here as you drop.* An empty Trail: *Your trail starts with the first ripple.* *(Retired: A quiet day so far / A quiet day / Nothing planned yet (H20c); Your trail starts with the first ripple on Home, and Stories gather what keeps happening (H21).)*

## 10. Open items

- Onboarding flow beyond functional empty states (first drop before first invite; "everyone's submerged" roster copy).
- Home-Lanes-Detail person/pool filter chips in mockup: undecided whether that view includes others' content (would be a new axis decision) or is mine-only (then remove chips).
- Friend-rail wave unification; quiet-day row compression thresholds.
- Swim focus screen: lane card enlarged + my timer, nothing more (one-liner, P3).
- **A future-dated block places its post at the bottom of the ground** (H20c, H21d): the present-and-writing zone takes it. Accepted for now and a dogfood watch item: if plans crowd the bottom, the fallback is a plans shelf. Lanes already leaves them out of cell counts.
- **The untitled single-line post (H21).** A line in the content with no title is a post with no title; the dump posture is kept on purpose. Dogfood decides whether untitled posts pile up into noise or stay the fast path.
- **The status bar on the ground.** The viewport's theme colour stays white app-wide; Home's blue ground meets a white status bar in the installed app. Revisit if it reads as a band.
- *Dormant with the live surfaces (H20b):* **Timed inner ripples, partly settled (H18).** Inner mode has **no Timer**, not "Drop only": a typed span is allowed inside a session, validated by containment, so a backfilled break or a call taken during a focus block can be recorded with its own span. That answers the old open question about arbitrary timed children in the retroactive direction, and it settles the break-identity worry the safe way round — **breaks were identified by span rather than by name, and that still holds**, but a break is no longer the *only* timed child, so "a timed inner ripple" and "a break" are no longer the same set. What remains open: whether a timed child may ever be started live and outlive its parent, and whether two timed children may overlap inside one parent (today's containment and the exclusion constraint say no to both).
- *Dormant with the live surfaces (H20b):* **Detach is deliberately absent.** An inner ripple cannot be promoted to top-level by moving it out of its parent: its time is clamped to the parent's span, and the way out is delete and re-drop. Composition is a decision made when the record is written, not a later re-filing, and a detach control would put a second structural verb next to the three that already exist (drop, timer, break). Revisit only if dogfooding produces the need.
- E2EE stance: rejected in favor of access control (RLS); revisit only if positioning changes.
- Monetization: explicitly a non-goal (portfolio + personal use).
