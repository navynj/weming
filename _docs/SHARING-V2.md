# Sharing model v2 (design, 2026-10-26)

Status: **design for review. No code, no migration.** This replaces the first v2 draft and its amendment. Every number below was read on 2026-10-26, with ids as their first eight characters and no content.

## 0. The model in one page

**Two places, and no links by default.**

| | Home record | Pool record |
| --- | --- | --- |
| Where it is written | on Home, in one of my lanes | inside a pool, on one of its lanes |
| Whose | mine | mine, or joint: the pool's, with members' sides |
| Its lane | one of mine | the pool lane; no lane of mine |
| Who reads it | me, plus each pool I share it to, record by record | the pool |
| Default when writing | Audience "Only me", for every lane | my pool record; **Together** (pick member faces) makes it joint |

**Sharing a Home record is per record.** In Audience, turn on a pool and pick one of its lanes (emoji chips). Nothing carries over to the next record, unless an advanced link says so.

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
| Home records in a lane with an `out`/`both` link (these would default to shared, for new records only) | 23 posts' lanes |
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
| Link `both` | advanced link: share by default **on**, as the default pool lane for (my lane, pool); **home lane** for its pool lane |
| Link `out` | advanced link: share by default **on**, as the default pool lane for (my lane, pool); **no home lane** (it never brought records in) |
| Default pool lane per (my lane, pool) | the sending link (`out`/`both`; at most one per (my lane, pool) by 0019); with none, the oldest link, with share off |
| Home lane per (pool lane, me) | the `both`/`in` link (at most one per (me, pool lane) by 0009); none for an `out`-only pool lane |
| Shared placements | **unchanged**, every row (5 on production, 4 on local). Still shared, same pool lane |
| Just mine | **a pool record of mine**. The same row: owner me, its pool, its placement, no lane of mine. Nothing moves |
| Joint records | unchanged. Their Home column follows the home lane (above) |
| Joint ripples' stored lane | none (0029) |

**What does not change for anyone:**
- **Visible stays visible:** every shared placement, every joint record and every pool record keeps its readers.
- **Private stays private:** defaults act only on records written after the switch. No existing record gains a placement, and no unlinking or re-mapping creates one.
- **My Home's columns:** the same for every record on production.

---

## 3. Schema (expand, switch, contract)

The theme work (in progress) takes 0032, so v2 is **0033** (expand) and **0034** (contract).

### Links: `lane_mappings`, kept and widened

```
lane_mappings(
  id, user_id, my_category_id, pool_lane_id, pool_id, created_at,   -- as now
  direction            -- frozen in 0033, dropped in 0034
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

"Add your side" waits for invitees who have not written; this replaces "every current member". RLS: readable by the pool's current members, written by joint-splash functions only. Backfill: decision 4.

### Pool records

A pool record **is** today's Just-mine row: `splashes.own_pool_id` and its placement, with its holds (`hold_own_pool`, `hold_own_pool_placement`, `check_own_pool_placed`). Only the name of the idea changes; the column keeps its name (a rename is destructive and buys nothing). Writing from a pool makes one by default.

### Expand, switch, contract

| Step | Contents |
| --- | --- |
| **0033 expand** | Add the three markers and `joint_invitees`, and backfill them by §2 and decision 4. Add the deferred one-default trigger. Add the new functions beside the old (§4). Relax the placement policy's helper as in §4. Old app and new app both work. |
| **Switch (app)** | Audience per record; pool compose with Together; Home pool columns; Advanced links. Nothing writes `direction`, calls the retired functions, or reads Just mine as a separate kind. |
| **0034 contract** | Destructive; needs your quoted approval (§6, decision 8). See the list below. |

**0034 contract steps:**
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
| `join_pool` / `create_pool` | take links and "include earlier records" | links ignored; the UI sends none since the hotfix (`p_links` stays in the signature until 0034) |
| `_place_history` | places earlier posts from `out`/`both` links on join | **retired** with join-time matching (decision 5) |
| `placeNewSplash` / `poolLaneFor` (app) | the pool lane my record's lane links | the pool lane chosen in Audience for this record |
| `set_splash_lane` | a lane change moves my record's placements to where the new lane sends | a lane change **moves no placement**: sharing is per record |
| `create_own_pool_splash` | makes a Just-mine record | kept: makes **my pool record** (the default from a pool) |
| `create_joint_splash` | joint, awaiting every member | joint with **invitees** (Together) |
| `splash_to_joint` / `splash_to_mine` | personal or Just mine ↔ joint | kept for my record ↔ joint (decision 3 sets the pairs) |
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
- **The Audience sheet:** one row per pool I'm in, each with a switch. Turned on, the row shows that pool's lane chips, and one must be picked (preselected only by a link's default). Nothing is remembered for the next record.

### Pool compose with Together
- That pool's lane chips (emoji and name) are the one choice. No tabs, no *Just mine* switch.
- **Together:** member faces under the chips, none selected.
  - With none selected, the summary reads "Yours · in <Pool>", and Drop makes **my pool record**.
  - Selecting faces reads "Together with Mina, Jae", and Drop makes a **joint record** whose "Add your side" slots are those members.

### Edit sheets
- **Home record:** lane, title, icon and dates; Audience per pool with its lane chip. **Make it joint…** picks the pool, a pool lane and who's together.
- **Pool record (mine):** title, icon, dates and pool lane chip. **Make it joint…** (Together) and **Move to Home…** (decision 3).
- **Joint:** title and icon for any member; pool lane; **Together** to add people (decision 6). **Make it mine** appears only while every ripple is mine.

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

## 6. Decisions I need from you

1. **Home lane optional per (pool lane, me)?** With it optional, every production record keeps its Home column, including `673226e9` in its pool's column. I recommend optional.
2. **Where defaults live:** marker columns on `lane_mappings` (§3), or a separate defaults table? I recommend the markers.
3. **Which conversions stay?** I read "my record ↔ joint" as two pairs and recommend keeping both:
   - Home record ↔ joint;
   - pool record ↔ joint.

   Also: should a pool record be able to move to Home (into a lane of mine, leaving it shared to that pool)? Today `splash_to_mine` does this for Just mine. I recommend yes, as **Move to Home…**.
4. **Joint invitees backfill** for the 10 production and 2 local joint records:
   - **(a)** All current members, which keeps today's "Add your side" slots. **I recommend (a).**
   - **(b)** Only those who have written, which leaves no open slots.
5. **Retire "include my earlier records"** (`_place_history`) with join-time matching? With no links at join, it has nothing to place. I recommend retiring it.
6. **Can any member add people to a joint record's Together later,** or only the person who started it? I recommend any current member, matching who may edit its title.
7. **Placement policy:** my record may be placed on any lane of a pool I'm a current member of, with no link required (§4). Approve?
8. **0034 contract:** the drops in §3 are destructive DDL, and I'll ask for your quoted approval there. Fold H24's release 2 (`ripples.category_id`) into it, or keep it separate?
9. **Numbering:** theme is 0032 and H26; v2 is 0033/0034 and **H27** once approved.
