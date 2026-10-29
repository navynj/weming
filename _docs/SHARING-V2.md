# Sharing model v2 (design, 2026-10-26)

**Superseded in part (2026-10-28, H45, H46):** advanced links, their defaults and the home lane are retired; where a record shows on my Home is `home_filing` (0060), per record and private; conversions are retired; a pool record's origin can be turned off. See DECISIONS H45 and H46.

Status: **approved 2026-10-26** (§6 answered; the mapping changed so no migrated link shares by default). 0033 and the app switch are in progress on `feat/sharing-v2`. This replaces the first v2 draft and its amendment. Every number below was read on 2026-10-26, with ids as their first eight characters and no content.

## 0. The model in one page

**Two places, and no links by default.**

| | Home record | Pool record |
| --- | --- | --- |
| Where it is written | on Home, in one of my lanes | inside a pool, on one of its lanes |
| Whose | mine | mine, or joint: the pool's, with members' sides |
| Its lane | one of mine | the pool lane; no lane of mine |
| Who reads it | me, plus each pool I share it to, record by record | the pool |
| Default when writing | Audience "Only me", for every lane | my pool record; **Together** (pick member faces) makes it joint |

**Sharing a Home record is per record.** In Audience, turn on a pool and pick one of its lanes (emoji chips). Nothing carries over to the next record, unless an advanced link says so. When I turn a pool on and no link default applies, the chip starts on the pool lane I last picked for that (my lane, pool) on this device. This only fills the chip; it never turns sharing on.

**Home shows everything I wrote:**
- my lanes as columns;
- one column per pool, with its monogram and name, holding my pool records and the joint records I took part in, shown only while that pool has any;
- a pool I left reads "A pool you left".

**Links are advanced only.** They live under Pool settings → Advanced → "Connect your lanes", and are never part of joining or composing. Links connect my lanes and a pool's lanes, many to many, with two optional defaults:

| Default | Scope | Means |
| --- | --- | --- |
| **Share by default** (off when created) + **default pool lane** | per (my lane, pool) | a Home record in that lane preselects that pool and pool lane in Audience |
| **Home lane** (optional) | per (pool lane, me) | pool records and joint records on that pool lane show in that lane's column on Home instead of the pool's column. Display only |

Unlinking moves nothing: it changes defaults and display, never a record or a placement.

**Retired:**
- lane matching when joining (gone already, hotfix `d300d18`) and when creating (optional since the same hotfix);
- link directions (out, both, in);
- Just mine as a separate kind: a pool record of mine is now simply the default when writing in a pool;
- the stored lane on pool and joint ripples (already none since 0029);
- the conversions except my record ↔ joint (§6, decision 3).

---

## 1. Data survey

Read-only, run on 2026-10-26.

### Production

| Question | Answer |
| --- | --- |
| Links, by direction, with the shared posts placed on each | **out 4** (`63b3fcd5 34a400b5 b1d2d720 7f892f49`): **0** shared posts. **both 1** (`cb442d62`): **0**. **in 3** (`ccd9471c` 0, `102bcccc` 1, `6dac439e` 4): **5** |
| Just-mine splashes | **0** |
| Joint splashes / joint ripples | 10 / 10 |
| Shared Home records placed through a link's default (`out`/`both`) | **0** |
| Shared Home records placed by hand (Audience, under an `in` link) | **5**: `9da6839e 48ab5d89 1744f47c f106dac1 fc15c5d9` |
| Shared Home records with no link at all | 0 (RLS requires one today) |
| Placements switched off | 0 |
| Home records in a lane with an `out`/`both` link | 23 posts' lanes. Mapping these links to share by default would start sharing new Home records there without anyone choosing it, so every migrated link starts with it off (§2) |
| Joint records shown in a linked lane on Home today (`both`/`in`) | 9: `150d67ae 234f041a 32aba650 3a5be98e 5e6df9ae 8caf3bed 991c1e0e a011c9c7 af869785` |
| Joint records in a pool's column today (`out`-only or unlinked) | 1: `673226e9` |

### Local

| Question | Answer |
| --- | --- |
| Links | 6, all **both**: `dfc00a0f`:1 `7f0b264c`:1 `d3df5ec6`:0 `dae73936`:0 `ac9c05c7`:1 `c11de421`:0 shared posts |
| Just-mine splashes | 1 (`e5f67252`), with its one placement |
| Joint splashes / ripples | 2 / 2 |
| Shared Home records through a link's default / by hand / no link | 3 (`831f34b1 7f210d88 f1000000`) / 0 / 0 |
| Joint records in a linked lane / in a pool's column | 2 (`defd8048 f2000000`) / 0 |

### What the survey says

- **Nothing on production was shared by a default.** Every shared Home record was shared by hand, so "Only me by default" matches how the app has actually been used.
- **No Just-mine record exists on production,** so retiring the kind changes no production record.
- **Display survives intact** if the home lane is optional (decision 1):
  - the 9 joint records shown in a lane keep their lane, through a home lane taken from `both`/`in`;
  - `673226e9` stays in its pool's column, because `out` sets no home lane.

---

## 2. Mapping current data

| Today | v2 |
| --- | --- |
| Link `in` | advanced link: share by default **off**; **home lane** for its pool lane |
| Link `both` | advanced link: share by default **off**; the default pool lane for (my lane, pool); **home lane** for its pool lane |
| Link `out` | advanced link: share by default **off**; the default pool lane for (my lane, pool); **no home lane** (it never brought records in) |
| Default pool lane per (my lane, pool) | the sending link (`out`/`both`; at most one per (my lane, pool) by 0019); with none, the oldest link. **Share by default is false on every migrated default row**, including `out` and `both`: Home is private by default, and people turn sharing on under Advanced |
| Home lane per (pool lane, me) | the `both`/`in` link (at most one per (me, pool lane) by 0009); none for an `out`-only pool lane |
| Shared placements | **unchanged**, every row (5 on production, 4 on local). Still shared, same pool lane |
| Just mine | **a pool record of mine**. The same row: owner me, its pool, its placement, no lane of mine. Nothing moves |
| Joint records | unchanged. Their Home column follows the home lane (above) |
| Joint ripples' stored lane | none (0029) |

**What does not change for anyone:**
- **Visible stays visible:** every shared placement, every joint record and every pool record keeps its readers.
- **Private stays private:** no migrated link shares by default, so a new Home record stays Only me until someone turns sharing on under Advanced or in Audience. Defaults act only on records written after that. No existing record gains a placement, and no unlinking or re-mapping creates one.
- **My Home's columns:** the same for every record on production.

---

## 3. Schema (expand, switch, contract)

The theme work (in progress) takes 0032, so v2 is **0033** (expand) and **0036** (contract).

### Links: `lane_mappings`, kept and widened

```
lane_mappings(
  id, user_id, my_category_id, pool_lane_id, pool_id, created_at,   -- as now
  direction            -- frozen in 0033, dropped in 0036
  is_default       boolean not null default false,  -- the default pool lane for (my_category_id, pool_id)
  share_by_default boolean,                         -- on the default row only; false when created
  is_home          boolean not null default false   -- the home lane for (user_id, pool_lane_id); optional
)
unique (my_category_id, pool_lane_id)                         -- as now
unique (my_category_id, pool_id) where is_default             -- at most one default
unique (user_id, pool_lane_id)   where is_home                -- at most one home lane
check  ((share_by_default is null) = (not is_default))
```

A (my lane, pool) with links always has one default row, kept by a deferred trigger; when that row goes, the oldest remaining link takes it. The home lane is optional, and none means the pool's column.

### Joint invitees, for "Together"

```
joint_invitees(splash_id → splashes on delete cascade, user_id → profiles, invited_at)
primary key (splash_id, user_id)
```

"Add your side" waits for whoever the record is together with, less those who have written; this replaces "every current member". RLS: readable by the pool's current members, written by joint-splash functions only.

**Everyone** (Yoonji, in the session): `splashes.joint_invite_all`, a flag, not rows.
- **What it does:** the record is together with every current member of its pool, including people who join later. Individual picks stay fixed rows in `joint_invitees`.
- **Who it waits for:** `joint_together(splash ids)` is the one reading of "together with": every current member under Everyone, else the picked invitees still in the pool. A member who leaves drops out of the open slots; one who already wrote keeps their side.
- **Only ever turned on:** a trigger refuses turning it off, and a conversion out of joint resets it.
- **Pool default:** `pools.invite_all_by_default` is the pool setting "Invite everyone to new posts by default", off when a pool is made. When on, Everyone is preselected in that pool's compose.
- **Backfill (decision 4):** Everyone on for every existing joint record; no invitee rows.
- **The column defaults to on** (Yoonji, in the session), so a joint record the old app makes between the push and the deploy keeps inviting every member. The old calls `create_joint_splash` and `splash_to_joint` become wrappers that make Everyone on. The new app always says which, through `create_together_splash` and `splash_to_together`: false unless Everyone or the pool default is on. On insert, a record with an owner is never together, whatever the default.

### Pool records

A pool record **is** today's Just-mine row: `splashes.own_pool_id` and its placement, with its holds (`hold_own_pool`, `hold_own_pool_placement`, `check_own_pool_placed`). Only the name of the idea changes; the column keeps its name (a rename is destructive and buys nothing). Writing from a pool makes one by default.

### Expand, switch, contract

| Step | Contents |
| --- | --- |
| **0033 expand** | Add the three markers and `joint_invitees`, and backfill them by §2 and decision 4. Until 0036, the old indexes still hold: one link of mine per pool lane (0009), and one `out`/`both` link per (my lane, pool) (0019). The new app writes every new link as `in`, a value nothing reads after the switch, so 0019 never refuses it; many-to-many waits for 0036. Add the deferred one-default trigger. Add the new functions beside the old (§4). Relax the placement policy's helper as in §4. Old app and new app both work. |
| **Switch (app)** | Audience per record; pool compose with Together; Home pool columns; Advanced links. Nothing writes `direction`, calls the retired functions, or reads Just mine as a separate kind. |
| **0034 follow-up** | Additive. 0033 reached production as it stood at the push, and two later edits to it never did, since a pushed migration is not applied again. The 0033 file was put back to what production ran, and the edits land here: `joint_invitees.pool_id` with its placement key, `joint_together` reading joint rows alone, and `splash_to_mine` keeping no placement. |
| **0036 contract** | Destructive; needs your quoted approval (§6, decision 8). See the list below. |

**0036 contract steps:**
- **Freeze `direction`,** then drop it with its enum `lane_link_direction`.
- **Drop the indexes that block v2:**
  - `lane_mappings_one_per_pool_lane` (0009), which forbids many-to-many;
  - `lane_mappings_one_sender` (0019).
- **Drop the retired functions:**
  - `splash_to_just_mine`, `_sending_lane` and `_joint_lane_for`;
  - `_place_history` (decision 5);
  - `invite_lanes` (nothing reads it since the hotfix);
  - `splash_reaction_summary` and `splash_reply_preview`.
- **Optional:** H24's release 2 (`ripples.category_id`), if you approve it there.

---

## 4. Functions and policies

| Object | Today | v2 |
| --- | --- | --- |
| Placement policies (`lane_is_mine_in`) | a placement on a pool lane any of my lanes links | a placement of my record on **any lane of a pool I am a current member of**, needed because Audience picks a pool lane per record with no link. Same author-only rules as now. Not a widening of who reads: only the author places, and only into their own pools |
| `_set_links` | writes links with directions; switches placements off on unlink and on losing `out` | writes links and markers; **switches nothing off.** Unlinking changes defaults and display only |
| `set_lane_links` (settings) | the full link set with directions | the Advanced screen's links and markers |
| `join_pool` / `create_pool` | take links and "include earlier records" | links ignored; the UI sends none since the hotfix (`p_links` stays in the signature until 0036) |
| `_place_history` | places earlier posts from `out`/`both` links on join | **retired** with join-time matching (decision 5) |
| `placeNewSplash` / `poolLaneFor` (app) | the pool lane my record's lane links | the pool lane chosen in Audience for this record |
| `set_splash_lane` | a lane change moves my record's placements to where the new lane sends | a lane change **moves no placement**: sharing is per record |
| `create_own_pool_splash` | makes a Just-mine record | kept: makes **my pool record** (the default from a pool) |
| `create_joint_splash` | joint, awaiting every member | joint with **invitees** (Together) |
| `splash_to_joint` / `splash_to_mine` | personal or Just mine ↔ joint | to joint from a pool (`splash_to_together`); to mine from Home only, its lane and Audience set anew: `splash_to_mine` keeps no placement |
| `splash_to_just_mine` | personal or joint → Just mine | **retired** |
| `move_pool_splash` | joint or Just mine within its pool | joint or pool record within its pool (unchanged) |
| `delete_pool` | Just mine → a made lane; joint → the author's `_joint_lane_for` lane, else a made lane | pool records → a made lane (as Just mine); joint → the author's **home lane** for its pool lane, else a made lane |
| Home columns (`jointLaneFor`, `home-badge`) | joint in my linked lane (`both`/`in`), else the pool's column; Just mine in the pool's column | pool records and joint records in the **home lane** if marked, else the pool's column |
| `_ripple_pools`, `can_see_ripple`, reactions (0030) | via joint pool or shared placements | unchanged |
| Board layouts (0025) | (splash, pool) and (splash, me) | unchanged |

---

## 5. UI per screen

No "lane" on compose or join: emoji chips and names only. Settings carry the word, with a one-line explanation.

### Home compose and Audience
- My lane chips, as now.
- Audience reads **"Only me"** unless an advanced link shares the chosen lane by default; then it preselects that pool and pool lane ("Our Pool · 🎲 Games").
- **The Audience sheet:** one row per pool I'm in, each with a switch. Turned on, the row shows that pool's lane chips, and one must be picked. The chip is preselected by the link's default pool lane, or else by the pool lane I last picked for that (my lane, pool) on this device (`localStorage`). The last pick only fills the chip; it never turns a pool on.

### Pool compose with Together
- That pool's lane chips (emoji and name) are the one choice. No tabs, no *Just mine* switch.
- **Together:** under the chips, a line reading "With", then the member faces, none selected.
  - **Everyone** sits at the right of the "With" line as a word and a small switch, so it reads as an option that turns on and off. When on, the switch and the word are in the primary colour. It is not a chip: the faces are the only round items in the row.
  - **How it selects:** Everyone selects every face; deselecting any face turns it off and keeps the rest. Selecting every face one by one does not turn it on.
  - **Default:** exactly the pool's setting "Invite everyone to new posts by default": on, Everyone starts on; off, it starts off — a pool where I am the only current member included. Nothing overrides what the switch shows (H61, superseding the solo pool's start on Everyone). The setting is the pool's, one value any member changes for all, and settings says so under the switch.
  - **Always shown:** even in a pool of one, the With line shows, Everyone alone with no faces.
  - With none selected, the summary reads "Yours · in <Pool>", and Drop makes **my pool record**.
  - Selecting faces reads "Together with Mina, Jae", or "Together with everyone", and Drop makes a **joint record** whose "Add your side" slots are those members, or every current member.

### Edit sheets
- **My records never become joint through With** (Yoonji, in the session). In the edit sheet and compose for my own records (Home records and my pool records), there is no With. Until per-pool invitees ship (0035), With is hidden on my records entirely.
- **Becoming joint:** the top card's `…` menu has **Make it a joint record of <Pool>…**, behind the confirm that lists the pools it leaves. It is the only path to `splash_to_together` for my records. It is offered in a pool for my record there, and on Home for my pool record. Everyone starts as compose's does.
- **Home record:** lane, title, icon and dates; Audience per pool with its lane chip. Opened in a pool, the pool's lane chips change only where it sits there.
- **Pool record (mine):** title, icon, dates and pool lane chip. On Home: picking a lane of mine moves it to Home.
- **With in compose** stays for a new record inside a pool: none picked makes my pool record; faces or Everyone make a joint record.
- **Joint:** title and icon for any member; pool lane; **Together** to add people (decision 6). **Make it mine** is on Home only (Yoonji, in the session), while every ripple is mine: picking a lane of mine makes it mine.
- **The fill** (Yoonji, in the session) follows invitees, not ownership. A record is filled (the Calendar's white or ink label, the List's pill) when Everyone is on, even in a pool of one, or once anyone besides its maker is picked. With Everyone off and nobody picked, it stays unfilled like any record.
- **Becoming mine on Home**, for a pool record or a joint record, sets its lane and its Audience anew. Audience starts as a new record's would (Only me, unless the lane's link shares by default), and it leaves its pool unless Audience shares it there.

### Home pool columns
- After my lanes: one column per pool with any of my pool records or joint records in it, headed by the pool's monogram and name.
- A pool lane with a **home lane** sends its records to that lane's column instead.
- A pool I left reads "A pool you left", with the neutral tile, as now.

### Pool settings → Advanced → "Connect your lanes"
- A one-line explanation: "Lanes are your own columns on Home. Connecting one to this pool can preselect sharing and show this pool's records in it."
- **Per lane of mine:** its connected pool lanes (chips, + to add), **Share by default** (a switch, off when created), and its **default pool lane** (one chip).
- **Per pool lane:** its **Home** marker among my connected lanes, or none.
- No arrows, no captions about directions.

---

## 6. Decisions (answered 2026-10-26)

1. **Home lane is optional** per (pool lane, me).
2. **Defaults are markers** on `lane_mappings`.
3. **Conversions kept:** Home record ↔ joint, pool record ↔ joint, and **Move to Home…** for a pool record. Amended in the session: to joint is done in the pool (Together); to mine is done on Home only, its lane and Audience set anew. Joint → pool record is gone.
4. **Joint invitees backfill: (a)**, all current members of the joint record's pool. This became **Everyone on** for each existing joint record (§3).
5. **"Include my earlier records" and `_place_history` are retired.**
6. **Any current member can add people to Together.**
7. **Placement on any lane of a pool I'm a current member of, author only:** approved.
8. **H24 release 2 stays separate** from 0036, as its own migration right after 0036 is verified.
9. **Numbering:** the theme lands as 0032 first. If it slips, v2 is renumbered rather than leaving a gap or an ordering problem.

**Mapping change (Yoonji):**
- Every migrated link gets `share_by_default = false`, including `out` and `both`: production shows 0 records shared through a default.
- The home lane mapping stays as proposed: `both` and `in` set it, `out` does not.

**Audience addition:** the chip remembers the last-picked pool lane per (my lane, pool) on this device (§5).

---

## 7. Next, after v2 ships: open splashes, as per-pool invitees (0035)

Scheduled as **0035**, after v2 ships (Yoonji, in the session). 0034 widens `joint_invitees` to carry a pool, so 0035 adds no table for invitees. 0036 is the contract.

**As decided:** instead of one "Open to everyone in <Pool>" switch, each pool my Home record is shared to gets its own **With**: Everyone, or faces picked. These are the same controls as a joint record's. Only those invited in a pool add their side there. The fill follows those invitees, as for any record.

**The shape after 0034** (`joint_invitees`):
- `pool_id` is null for a joint record's invitees, and set for invitees on my record in one pool.
- A per-pool row references its placement, `(splash_id, pool_id) → splash_placements`, on delete cascade.
- Keys today: the primary key `(splash_id, user_id)` from 0033, plus unique `(splash_id, pool_id, user_id)` where `pool_id` is set. That primary key still allows one row per person per record, so 0035 must move it to a surrogate `id` with unique `(splash_id, user_id)` where `pool_id` is null. Dropping a key is destructive and needs quoted approval there.
- `joint_together` reads joint rows alone.
- **For 0035:** read access to per-pool rows. Today's policy reads a joint record's rows; 0035 adds that pool's current members, and me as the record's author.

**Decided for 0035: unsharing hides, never deletes** (Yoonji, in the session).
- **Hidden, not deleted:** when my record stops being shared to a pool (its placement switched off), the ripples its members wrote there are hidden from that pool.
- **Back on reshare:** they reappear if I share it to that pool again.
- **The author still sees theirs:** each author keeps their own ripple on their Home, under the record's title, with a note that it is no longer shared.
- **What this needs:** a placement is switched off, never deleted, while a member's ripple hangs off it. The Audience functions already switch off rather than delete. 0035 must hold that for a placement with ripples, and also for `splash_to_together`, which today deletes placements (into joint is refused once others have written, so it never meets one).

Still sketched below (the per-pool Everyone flag and the ripple's pool) for 0035 to settle.

**The idea:** my record, open to several pools.
- **The switch:** on a shared placement of my record, "Open to everyone in <Pool>". An open placement shows the record with a joint-style fill and "Add your side" for that pool's members.
- **Who can add:** members of an open pool can add ripples.
- **Who reads what:**
  - My ripples are visible in every pool the record is shared to.
  - A member's ripple is visible only to that pool's current members and to me.
- **Tabs:** my Home and the detail sheet show per-pool threads as tabs ("Church · 5 | College · 3"). Members see only their pool's thread plus my ripples.

**Schema sketch:**
- `splash_placements.invite_all boolean not null default false`: Everyone in that pool (replaces the earlier `open` switch). Picks are `joint_invitees` rows with that `pool_id`.
- `ripples.thread_pool_id`: null for the owner's ripples, set for others'.
- RLS: a ripple with a `thread_pool_id` is readable by current members of that pool and by the splash owner.

**Does 0033 or 0036 block it?** Checked against today's schema; nothing blocks it, and every change it needs is additive:

| Piece | Today, and after v2 | What open splashes need |
| --- | --- | --- |
| Placement key `(splash_id, pool_id)` | one placement per pool, unchanged by v2 | Fits: `open` is per pool, so one flag per placement row |
| `splash_writable` (ripple insert/update) | the owner, or a current member of a joint record's pool | A third case: a current member of a pool with an open, shared placement, writing with `thread_pool_id` = that pool. Plus a check that `thread_pool_id` is null exactly when the author is the owner |
| `ripple_in_my_pools` (ripple select) | joint ripples by pool; on my record, only the owner's ripples, read through any shared placement | A third case: `thread_pool_id` is a pool I'm a current member of, and its placement is still shared. The owner reads through "readable by … the splash owner", a new policy |
| `_ripple_pools` and reactions (0030) | the joint pool, or every shared placement | For a thread ripple, that one pool alone. Otherwise a member's ripple would show in the record's other pools |
| `hold_ripple_inheritance` (0029/0031) | takes the date and lane from the splash, with no author check | Fits as is |
| Unsharing or removing a placement | v2's `_set_links` switches nothing off, and `set_splash_lane` moves nothing; Audience turns a placement off | **Decided:** off hides the pool's ripples, never deletes them, and resharing brings them back. Removal is refused while members' ripples hang off it (see above) |
| `_require_only_mine` (to joint, Move to Home) | refuses once others have written | Fits by default: an open record with threads cannot become joint. Whether that is wanted needs deciding then |
| `delete_pool`, `leave_pool` | v2 rewrites `delete_pool` for pool records and joint (home lane) | The pool's thread ripples on others' records need a destination: as for joint, each author's ripples become a post of theirs. `leave_pool` hides them as for joint |
| 0036 drops | `direction`, the 0009/0019 indexes, `_sending_lane`, `_joint_lane_for`, `_place_history`, `invite_lanes`, the two summaries | None of these is needed. H24 release 2 dropping `ripples.category_id` is neutral |

**Adjustments to v2:** none needed. One thing to keep in mind while writing 0033: placement removal is the only path that could orphan a thread later, so the new Audience functions should keep turning a placement off (`shared = false`) rather than deleting the row. That is already today's behaviour, and 0033 will keep it.

---

## 8. Plan: 0035, per-pool invitees on my records (for review, 2026-10-26)

Status: **built** on `feat/per-pool-invitees` (0035), rehearsed on the fixture and the production dump, and stopped before the push. It implements §7 as decided, plus Yoonji's additions: pool deletion, members leaving, and the ROADMAP list afterwards.

### What it does
- **Audience:** each pool row that is on shows its own With line ("With · Everyone" and that pool's member faces), none picked by default. My pool record gets the same With in its edit sheet, for its one pool.
- **Writing:** invited members of that pool get "Add your side" on my record there. Their ripples carry that pool (`ripples.thread_pool_id`).
- **Reading:**
  - A member's ripple is visible only to that pool's current members and to me.
  - My own ripples stay visible in every pool the record is shared to.
  - My Home and the detail sheet show per-pool threads as tabs ("JY · 3 | SY · 2"). A pool's members see that pool's thread plus my ripples, with no tabs.
- **Unsharing:** turning a pool's placement off hides that pool's members' ripples and never deletes them. Turning it on again restores them. Each author still sees their own ripple on their Home, under my record's title, with a note that it is no longer shared.
- **Fill and slot:** follow the joint rule, per pool.
  - In a pool, my record is filled once that placement has Everyone or anyone picked.
  - Its "Add your side" slot waits for invited current members of that pool who have not written there.

### Schema
| Change | Kind | Notes |
| --- | --- | --- |
| `joint_invitees`: primary key from `(splash_id, user_id)` to a new `id`; unique `(splash_id, user_id)` where `pool_id` is null (the per-pool key exists since 0034) | **Destructive** (drops a primary key) | Needs Yoonji's quoted approval. One person invited in two pools of one record needs it. Production: 0 rows today |
| `joint_invitees.pool_id` comment | — | 0034's comment names the per-pool migration "0036"; rewritten to 0035 |
| `splash_placements.invite_all boolean not null default false` | additive | Everyone in that pool |
| `ripples.thread_pool_id uuid` | additive | Null for my ripples and on joint records. Set for a member's ripple on my record: the pool it was written in |
| FK `(splash_id, thread_pool_id) → splash_placements (splash_id, pool_id)`, **on delete restrict** | additive | A placement holding members' ripples can be switched off, never deleted. "Never deletes" is held by the database |
| `hold_ripple_thread` (trigger) | additive | `thread_pool_id` is null exactly when the author owns the record, or the record is joint. It never changes after insert |

### Functions and policies (no policy is removed; two are altered)
- **`placement_together(splash ids)`:** who each (record, pool) is together with now. It is `joint_together`'s twin: under Everyone, the pool's current members; otherwise the pool's picked rows for people still in the pool.
- **`set_placement_together(splash, pool, users[], everyone)`:** the author alone, on a shared placement. Picks are replaced, since unlike a joint record the author may also take people off. An invitee who already wrote keeps their side.
- **Ripple insert and update policies** (`alter policy … with check`):
  - The author writes with `thread_pool_id` null on my record or on a joint record, as today.
  - An invited current member of P writes with `thread_pool_id = P` on my record, while that placement is shared.
- **`ripple_in_my_pools`**, a new branch: a thread ripple is readable by P's current members while the placement is shared and its author is `member_visible` there. Leaving with "remove" hides theirs; "keep" keeps them, which matches placements.
- **My reading of their ripples:** a new branch for the record's owner, on or off. Off, they show in a muted "<Pool> (off)" tab (decision 2).
- **`_ripple_pools`** (reactions and replies, 0030): a thread ripple's audience is its one pool, not every pool the record is shared to.
- **`my_thread_ripples()`:** security definer. An author's own thread ripples with the record's title, the pool's name and whether it is still shared, for their Home. It is needed because the record itself is unreadable to them once the placement is off.
- **`delete_pool`** (Yoonji's addition):
  - Ripples members wrote on my record in that pool go back to each author as a post of one per (record, author), titled like my record.
  - Each lands in a lane made from the pool lane, the same way detached joint ripples are handled.
  - My record loses that placement. The ripples move before the pool's rows go, so the restrict never fires.
- **`leave_pool`** (Yoonji's addition): their thread ripples follow `keep_on_leave` through `member_visible`, like their placements. No change to the function.
- **Conversions:** they refuse while members have written on my record: "Make it a joint record of…" (`_require_only_mine`, already the case) and Move to Home (a placement it would drop holds their ripples).

### App
- **Audience sheet:** a With line per pool row that is on; faces come from that pool's members (`getMyPoolNames` gains members).
- **Edit sheet:** my pool record gets With for its pool. My Home record's With lives in Audience.
- **Writing:** "Add your side" on my record in a pool passes the pool; `addBlock` takes `threadPoolId`.
- **Home and the detail sheet:** tabs per pool for my record: "JY · 3 | SY · 2", my ripples in every tab. A member's own thread ripples show on their Home from `my_thread_ripples`.
- **Board:** pool cards' fill and slot from `placement_together`; Home's fill too (below).

### Tests and rehearsal
- **DB tests:**
  - an invitee can write and a non-invitee can't;
  - a thread ripple is visible only in its pool and to me;
  - switching the placement off hides it and switching back restores it, and a delete is refused;
  - leaving with keep or remove;
  - `delete_pool` returns posts to authors;
  - reactions follow the thread's pool.
- **Render tests:** With in Audience, tabs, slot and fill per pool.
- **Rehearsal:** the fixture and a fresh production dump. Before and after: every placement and every ripple's visibility to each member is unchanged (no thread ripples exist yet).

### Home visibility (Yoonji, in the session): no new rules, only where things show
- **Home shows each record with exactly the ripples I can already read.** Nothing is hidden or added because it is Home.
- **My record:**
  - the detail shows every pool's thread as tabs;
  - the stack card shows my ripples first, then others';
  - one line sums up each pool, faces and counts: "JY · 3 · SY · 2".
- **A friend's record where I added my side:** it appears on my Home in that pool's column, or my home lane if linked. It shows what that pool sees: the friend's ripples, that pool's members' ripples, and mine. Other pools' threads on it stay invisible to me.
- **Joint records:** unchanged.

### Decisions (Yoonji, 2026-10-26)
1. **Approved,** to be quoted in the migration and its commit: "Approved: drop joint_invitees' primary key (splash_id, user_id) and use a surrogate id with one unique key per use. Production has 0 rows."
2. **While a pool's placement is off,** I, the record's owner, still see that pool's members' ripples, in a muted tab labelled "<Pool> (off)". Nobody else in that pool sees them except each ripple's own author. Switching the placement back on restores the tab for members.
3. **Deleting my record** returns members' ripples to their authors as a post of one per (record, author), as pool deletion does.
4. **Everyone** is a word plus a switch, in both compose and Audience.
5. **Home fill:** my record is filled on Home when any pool has someone invited on it.
6. **Tab counts** include only that pool's members' ripples, not mine.

**Order:** build after #13 merges, rehearse, and stop before the push.
