# Sharing model v2 (design, 2026-10-26)

Status: **design for review. No code, no migration.** Every number below was read on 2026-10-26, with ids as their first eight characters and no content.

## 0. The model in one page

**Two kinds of record.**
- **My record.** It lives in one of my lanes, and may be shared to zero or more pools: one placement per pool, each on one pool lane.
- **Joint record.** A pool owns it, and it is started inside that pool. Members add their side.

**Retired:**
- Just mine (`splashes.own_pool_id`).
- Link directions (`lane_mappings.direction`: out, both, in).
- Any per-ripple stored lane for joint ripples. H24 already cleared these: production has 0.
- Three conversions. Only *my record ↔ joint record* stays.

**Links connect my lanes and a pool's lanes, many to many, with two defaults.**

| Default | Scope | Means | Stored as |
| --- | --- | --- | --- |
| **Outbound default** | per (my lane, pool) | "Share by default" on or off, plus the one default pool lane a new record of that lane lands on | a marker on one link row, which also carries the on/off switch |
| **Home lane** | per (pool lane, me) | which of my linked lanes shows that pool lane's joint records on my Home | a marker on one link row |

Display is derived, as H24 made it, and nothing is stored on ripples. Several of my lanes linked to one pool lane all send there, with no per-record choice. When one lane of mine links to several lanes of a pool, composing offers those pool lanes as chips, with the default preselected.

---

## 1. Data survey

Read-only, run on 2026-10-26.

### Production

| Question | Answer |
| --- | --- |
| Links (total / owners) | 8, all one person's |
| … by direction | **out 4** `63b3fcd5 34a400b5 b1d2d720 7f892f49`; **both 1** `cb442d62`; **in 3** `ccd9471c 102bcccc 6dac439e` |
| Pools / current members | 3 (`6bb14a03 15b2cc7c d1c664e1`) / 3 memberships |
| Just-mine splashes | **0** |
| Joint splashes / joint ripples | 10 / 10. Each has one writer out of one member; `32aba650` has no ripple yet |
| Joint ripples with a stored lane | 0 (cleared by 0029) |
| Placements (shared / off) | 5 / 0 |
| Records shared to more than one pool | **0** |
| Pool lanes with more than one of a person's lanes linked | **0**. The schema forbids it today: `lane_mappings_one_per_pool_lane` (0009) |
| (my lane, pool) with more than one pool lane linked | 0 |
| Placements whose post's own lane is linked to the placement's pool lane | 5 of 5 |
| Board layouts (pool / home) | 10 / 6 |

The links, by pool:

| Link | My lane | Pool | Pool lane | Direction | Made |
| --- | --- | --- | --- | --- | --- |
| `ccd9471c` | `807f7a07` | `15b2cc7c` | `894e8b3e` | in | 10-23 |
| `102bcccc` | `cd29bb11` | `15b2cc7c` | `ec2cafc4` | in | 10-23 |
| `6dac439e` | `bf3b6526` | `15b2cc7c` | `2bb440f5` | in | 10-23 |
| `cb442d62` | `60274235` | `15b2cc7c` | `b3ead86b` | both | 10-23 |
| `34a400b5` | `bf3b6526` | `d1c664e1` | `eceed62c` | out | 10-27 |
| `b1d2d720` | `807f7a07` | `d1c664e1` | `d7cdf62d` | out | 10-27 |
| `7f892f49` | `cd29bb11` | `d1c664e1` | `f91afb86` | out | 10-27 |
| `63b3fcd5` | `8e7270e4` | `d1c664e1` | `b885b126` | out | 10-27 |

### Local

| Question | Answer |
| --- | --- |
| Links | 6, all **both**, 3 owners |
| Just-mine splashes | **1** (`e5f67252`), whose pool lane none of its author's lanes links to |
| Joint splashes / ripples | 2 / 2 (`f2000000` with 2 writers out of 2 members; `defd8048` with none out of 1) |
| Placements (shared / off) | 4 / 0 |
| Shared to more than one pool / pool lanes with several lanes linked | 0 / 0 |

### What the survey says

- **No production record needs a new lane.** Just mine is empty there. Local's one needs a lane made from its pool lane (§2).
- **No many-to-many link exists yet,** so the two defaults are unambiguous for all current data: every link is its own (my lane, pool) default and its own (pool lane, me) home lane.
- **Two production behaviours change under the mapping you specified:**
  1. **Joint `673226e9`** (pool `d1c664e1`, pool lane `eceed62c`, linked **out** to `bf3b6526`). After H24 an `out` link *did* have an inbound meaning: it kept joint records **out** of my lane, in the pool's column (`jointLaneFor` reads only both and in). Under v2 every link is inbound-capable, so this record **moves from the pool's column into `bf3b6526`'s column** on Home. That is the one record that moves. You asked me to confirm "out had no inbound meaning after H24". It did, and this is its only current effect.
  2. **The 5 shared placements** `9da6839e 48ab5d89 1744f47c f106dac1 fc15c5d9` sit on lanes whose link to that pool is `in`. They were shared by hand through the Audience chip. Mapped as in → share by default off, they **stay shared**: placements are records, and a default only decides new ones. Nothing un-shares.

---

## 2. Mapping current data

| Today | v2 | Notes |
| --- | --- | --- |
| Link `in` | link; **share by default off** | 3 links on production |
| Link `both` | link; **share by default on** | 1 on production, 6 on local |
| Link `out` | link; **share by default on** | 4 on production. Its inbound meaning (joint records kept out of my lane) goes: see §1, record `673226e9` |
| Outbound default per (my lane, pool) | the link that sends today (`out`/`both`, at most one per (my lane, pool) by 0019); else the oldest link (`created_at`, then `id`) | Deterministic. Unique today: no (my lane, pool) has two links |
| Home lane per (pool lane, me) | the link `_joint_lane_for` picks today (`both`, then `in`, oldest first); else the oldest link | Preserves every joint record's Home column except `673226e9` (§1) |
| Just-mine splash | **my record** in the author's lane linked to its pool lane (the home lane if several); else **a new lane** named after the pool lane, with its emoji, suffixed `(<Pool>)` when the name is taken (delete_pool's rule). Its placement stays: shared, same pool lane. A link from that lane to that pool lane is made: share by default off, marked default and home | Production 0; local 1 (`e5f67252` gets a new lane) |
| Joint splash | unchanged | Its Home column is derived from the home lane |
| Joint ripples' stored lane | already none (0029) | — |
| Placements | unchanged, every row | 5 of 5 already fit the tighter rule in §4 |

---

## 3. Schema (expand, switch, contract)

### Link table: `lane_mappings`, kept and widened

```
lane_mappings(
  id, user_id, my_category_id, pool_lane_id, pool_id, created_at,   -- as now
  direction            -- FROZEN in 0032, dropped in the contract
  is_default  boolean not null default false,   -- outbound default for (my_category_id, pool_id)
  share_by_default boolean,                     -- set only on the default row: the (my lane, pool) switch
  is_home     boolean not null default false    -- home lane for (user_id, pool_lane_id)
)
unique (my_category_id, pool_lane_id)                                  -- as now: one link per pair
unique (my_category_id, pool_id) where is_default                      -- one outbound default
unique (user_id, pool_lane_id)   where is_home                         -- one home lane
check  (share_by_default is null) = (not is_default)                   -- the switch lives on the default row
```

**Exactly one default and one home where any link exists.** A deferred constraint trigger enforces this at commit:
- every (my lane, pool) with a link has one `is_default` row;
- every (person, pool lane) with a link has one `is_home` row.

When the marked row goes, its successor is the oldest remaining link, the same rule as the mapping.

Rejected: a separate defaults table. It holds the same facts in two places, and deleting a link would have to repair both.

### Expand, switch, contract

| Step | Migration | Contents |
| --- | --- | --- |
| **Expand** | 0032 | Add `is_default`, `share_by_default` and `is_home`, and backfill them by §2. Convert Just-mine splashes (§2) with the 0028 bypass pattern. Add the deferred one-default and one-home trigger. Add the new functions (§4) beside the old ones. Old app and new app both work against it. |
| **Switch** | app | Composer, edit sheet, pool link settings and Home columns move to v2 (§5). Nothing writes `direction`, `own_pool_id` or the retired functions any more. |
| **Contract** | 0033 | Destructive; needs your approval quoted there (§6). See the list below. |

**0033 contract steps:**
- **Freeze `direction`:** a trigger refuses any write that changes it.
- **Drop:**
  - `lane_mappings_one_per_pool_lane` (0009), which forbids many-to-many;
  - `lane_mappings_one_sender` (0019);
  - `direction` and its enum;
  - `splashes.own_pool_id`, with `splashes_own_pool_shape`, the triggers `splashes_hold_own_pool`, `splashes_own_pool_placed` and `splash_placements_hold_own_pool`, and their functions;
  - `create_own_pool_splash`, `splash_to_just_mine`, `_sending_lane` and `_joint_lane_for` (replaced, see §4);
  - `splash_reaction_summary` and `splash_reply_preview` (on the drop list since 2026-10-26).

Many-to-many only becomes possible at the contract, when `one_per_pool_lane` goes. Until then, the switch app treats each pool lane as linked to at most one of my lanes.

Optional: drop `ripples.category_id` in the same contract, if you approve H24's release 2 there. Otherwise it stays on its own.

---

## 4. Functions and policies

| Object | Today | v2 |
| --- | --- | --- |
| `_set_links` | links with direction; switches placements off on unlink or on losing `out` | links with defaults; unlinking switches the placements on it off, as now; **no direction comparison**. Changing a default or the share switch never re-shares or un-shares existing records |
| `_place_history` ("include my earlier records" on join) | places from `out`/`both` links | places each of my posts whose lane has **share by default on**, on that (lane, pool)'s **default pool lane** |
| `placeNewSplash` / `poolLaneFor` (app) | the pool lane my post's lane is linked to | the **default pool lane**, unless the composer chose another linked one for this record |
| `set_splash_lane` | placements follow the new lane where it sends (`_sending_lane`), else switch off | placements move to the new lane's **default pool lane** in that pool; with no link there, they switch off (kept), as now |
| `splash_to_joint` | mine (personal or Just mine) → joint | **kept**: my record → joint (the Just-mine branch goes) |
| `splash_to_mine` | joint or Just mine → mine | **kept**: joint → my record, into my **home lane** for its pool lane, else a lane I choose (the Just-mine branch goes) |
| `splash_to_just_mine`, `create_own_pool_splash` | — | **retired** (dropped in 0033) |
| `move_pool_splash` | joint or Just mine within its pool | **joint only**; my record's pool lane changes through its placement (the Audience pool-lane chip, §5) |
| `delete_pool` | Just mine → made lane; joint → each author's post in `_joint_lane_for`, else a made lane | Just-mine branch goes; joint → each author's post in their **home lane** for that pool lane, else a made lane (unchanged naming) |
| `_joint_lane_for` / `jointLaneFor` | link that brings in (both, in) | **`_home_lane_for(pool_lane, me)`**: the `is_home` link, else null (the pool's column). The app reads the same marker from `getMyLinks` |
| Placement RLS (`lane_is_mine_in`) | a placement on any pool lane any of my lanes links | **tightened:** a placement of my post on a pool lane that **the post's own lane** links. All 5 current placements already satisfy it |
| Link RLS | owner-only; the linked lane mine; the pool mine | unchanged, plus the markers are owner-written like the rest |
| Board layouts (0025) | pool scope keyed (splash, pool) | unchanged. A converted Just-mine splash keeps its pool layout (same splash, same pool) |
| Joint "Add your side" (`awaiting`) | every current member who has not written | **the members chosen in "Together"** who have not written (§5); needs `joint_invitees` (§6, decision 4) |
| `_ripple_pools`, `can_see_ripple`, reactions (0030) | through joint pool or shared placements | unchanged: a converted Just-mine record keeps its placement, so its readers and responses stay |

---

## 5. UI per screen

### Home compose
- My lane chips, as now.
- **Audience** shows that lane's default pools: "Only me", "<Pool>", or "2 pools".
  - Tap to add or remove pools for this record.
  - Each shared pool shows a small chip of its linked pool lanes when the lane links to several, with the default preselected; one tap picks another.
  - Sharing to a pool the lane has no link in asks once: **"Which lane in <Pool>?"** It lists that pool's lanes and saves the link (share by default off, marked default; home lane if the pool lane had none).
- No joint records from Home.

### Pool compose
- **Pool lane chips are the one choice.** No *Pool lanes | My lanes* tabs, no *Just mine* switch.
- **Summary line, derived:** "Yours · <my lane> · shared to <Pool>", where my lane is the chosen pool lane's **home lane**. Tapping it opens Audience for this record.
- If the pool lane has no link to my lanes, an inline question appears once: **"Keep this in which of your lanes?"** It offers my lanes and "+ New lane", and saves the link (marked home; default for (lane, pool) if that lane had none).
- **Shared to this pool only,** even when my lane shares elsewhere by default.
- **"Together":** member faces under the summary, none selected by default.
  - Selecting anyone makes a **joint record** of this pool, with "Add your side" for those members.
  - Selecting none makes **my record**.

### Edit sheets
- **My record:** lane, title, icon and dates as now. Audience lists each shared pool with its pool-lane chip. **"Make it joint…"** (my record → joint, choosing the pool and pool lane) replaces today's three-way conversion.
- **Joint:** title and icon for any member; pool lane within the pool (`move_pool_splash`). **"Make it mine"** appears only while every ripple on it is mine.

### Pool link settings (and join and create matching)
- One row per pool lane, listing my linked lanes. Add a link with "+".
- The row marked **Home** shows the pool lane's joint records on my Home; tap another to move the marker.
- Under each of my lanes in this pool: **"Share by default"** (a switch) and its **default pool lane** (one tap among its linked pool lanes).
- The direction arrow (↔ ← →) and its caption are removed.
- **Join and create:** matching proposes links as now. A matched lane gets share by default **on**, the default and home markers by order.

### Home columns
- **My records:** in their lane.
- **Joint records:** in the column of my **home lane** for their pool lane; with no link, in the pool's column (as today's unlinked case).
- **Just-mine columns go:** converted records sit in their lane.
- The pool's column remains only for joint records on pool lanes I have not linked.

---

## 6. Decisions I need from you

1. **Record `673226e9` moves on Home:** from pool `d1c664e1`'s column into `bf3b6526`'s column, because `out` loses its inbound meaning. Accept? Alternative: map `out` links to `is_home = false` and leave the pool lane with no home lane. But the model says a linked pool lane always has one, so I recommend accepting.
2. **Where the defaults live:** marker columns on `lane_mappings`, with the switch on the default row and a deferred exactly-one trigger, as in §3. Or a separate defaults table? I recommend the markers.
3. **New links made from a compose prompt:** "Which lane in <Pool>?" from Home and "Keep this in which of your lanes?" from a pool. Should **share by default** start **off** (this record is shared; future ones are not) or **on**? I recommend **off**: a default should be set on purpose, in link settings.
4. **"Together" for joint records** needs a new table, `joint_invitees(splash_id, user_id)`, so "Add your side" waits only for those chosen. What do the 10 production and 2 local joint splashes get?
   - **(a)** All current members as invitees, which keeps today's slots. **I recommend (a).**
   - **(b)** Only the members who have already written, which leaves no open slots.
5. **Tightened placement rule:** a post may be shared only onto a pool lane **its own lane** links (§4). All current data fits it. Approve?
6. **`set_splash_lane` stays as a plain lane change,** not a conversion. Your brief retired "the four conversion functions except one". I read the four as to_joint, to_mine, to_just_mine and set_splash_lane. Confirm that changing a record's lane stays. I'm also keeping to_joint and to_mine as the one my ↔ joint pair.
7. **The contract (0033) drops are destructive DDL.** I'll ask for your quoted approval there, listing:
   - `lane_mappings_one_per_pool_lane` and `lane_mappings_one_sender`;
   - `direction` and its enum;
   - `own_pool_id`, its constraint, three triggers and their functions;
   - `create_own_pool_splash`, `splash_to_just_mine`, `_sending_lane` and `_joint_lane_for`;
   - `splash_reaction_summary` and `splash_reply_preview`.

   Fold H24's release 2 (`ripples.category_id`) into it, or keep it separate?
8. **Local Just-mine `e5f67252`** becomes a record in a new lane named after its pool lane. It's local only; nothing on production is affected. Fine?
9. **Decision number:** this would be **H26** in DECISIONS.md once approved.
