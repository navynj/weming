import { initialsOf } from '@/features/home/grid';
import type { LinkMarkers } from '@/features/pool/links';
import { originTag } from '@/features/pool/origin-tag';
import type { Splash } from '@/features/splash/summary';
import type { Database } from '@/lib/database.types';
import type { BoardLayoutJson } from '@/features/month-board/board-layout';
import { getPoolLayouts } from '@/lib/queries/layouts';
import type { DuringClient } from '@/lib/queries/profile';
import type { RippleResponsesValue } from '@/features/responses/model';
import {
  getLockedIds,
  getRippleResponses,
  getResponsesOnMine,
  latestResponseOnMine,
} from '@/lib/queries/responses';

export type PoolRow = Database['public']['Tables']['pools']['Row'];
export type PoolLane = Database['public']['Tables']['pool_lanes']['Row'];
export type PoolInvite = Database['public']['Tables']['pool_invites']['Row'];
type RippleRow = Database['public']['Tables']['ripples']['Row'];

/** A ripple as a pool reads it: no category (that is the author's own vocabulary). */
export type PoolRipple = Pick<
  RippleRow,
  | 'id'
  | 'author_id'
  | 'splash_id'
  | 'note'
  | 'media'
  | 'occurred_on'
  | 'occurred_time'
  | 'ended_at'
  | 'created_at'
  | 'written_on'
  | 'started_at'
  | 'thread_pool_id'
>;

export type PoolMember = {
  userId: string;
  name: string;
  initials: string;
  joinedAt: string;
  /** Left, and chose to keep their records here: labelled "Former member". */
  former: boolean;
  /** Their profile's zone: their records are summarised in it, never the reader's (0013). */
  timeZone: string;
};

/** A pool in the switcher: who is in it, and when something last happened there. */
export type MyPool = {
  id: string;
  name: string;
  members: PoolMember[];
  /** The latest thing someone else put here, for the "new since my last visit" dot. */
  latestActivity: string | null;
};

export type Placement = {
  splashId: string;
  poolId: string;
  poolLaneId: string;
  shared: boolean;
  /** With · Everyone in that pool (0035). */
  inviteAll?: boolean;
};

export type PoolView = {
  /** `ownerId`: the creator, who alone may delete the pool (0015); null once their account is gone. */
  pool: Pick<PoolRow, 'id' | 'name'> & {
    ownerId: string | null;
    /** Pool settings: Everyone preselected in this pool's compose (0033). */
    inviteAllByDefault?: boolean;
    /** Pool settings: what I wrote here shows on my Home (0039). */
    myOnHome?: boolean;
    /** Its photo (0024): the version the row names, and the signed URL once the screen signs it. */
    photoVersion?: number | null;
    photo?: string | null;
  };
  /** Current members, me first then join order (D7), then former members who kept theirs. */
  members: PoolMember[];
  lanes: PoolLane[];
  /** My links only: a member never reads another's (RLS); advanced (0033). */
  myLinks: ({ poolLaneId: string; myCategoryId: string } & LinkMarkers)[];
  placements: (Placement & { ownerId: string })[];
  /** Placed posts and joint splashes, as RLS lets me see them. */
  splashes: Splash[];
  ripples: PoolRipple[];
  invites: PoolInvite[];
  /** Who each joint record here is together with now (0033). */
  together?: Record<string, string[]>;
  /** Who each record of someone's, shared here, is with in this pool now (0035). */
  placementTogether?: Record<string, string[]>;
  /** The calendar's layouts its members set, by splash (0025). */
  layouts?: Record<string, BoardLayoutJson>;
  /** What readers left on every ripple here, for the top card (H25), and my locked ones. */
  responded?: RippleResponsesValue;
  lockedIds?: string[];
  /** By splash then ripple of mine: the newest response someone else left (H25). */
  respondedAt?: Record<string, Record<string, string>>;
};

const RIPPLE_COLUMNS =
  'id, author_id, splash_id, note, media, occurred_on, occurred_time, ended_at, created_at, written_on, started_at, thread_pool_id';

type MemberRow = {
  pool_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  keep_on_leave: boolean | null;
  profile: { display_name: string; timezone: string } | null;
};

function toMember(row: MemberRow): PoolMember {
  const name = row.profile?.display_name ?? 'Someone';
  return {
    userId: row.user_id,
    name,
    initials: initialsOf(name),
    joinedAt: row.joined_at,
    former: row.left_at !== null,
    timeZone: row.profile?.timezone ?? 'UTC',
  };
}

/** Me first, then join order (D7); former members last, never as columns. */
export function orderMembers(members: PoolMember[], me: string): PoolMember[] {
  return [...members].sort(
    (a, b) =>
      Number(a.former) - Number(b.former) ||
      Number(b.userId === me) - Number(a.userId === me) ||
      a.joinedAt.localeCompare(b.joinedAt),
  );
}

async function membersOf(supabase: DuringClient, poolIds: string[]): Promise<MemberRow[]> {
  if (poolIds.length === 0) return [];
  const { data, error } = await supabase
    .from('pool_members')
    .select(
      'pool_id, user_id, joined_at, left_at, keep_on_leave, profile:profiles(display_name, timezone)',
    )
    .in('pool_id', poolIds)
    .returns<MemberRow[]>();
  if (error) throw error;
  // A member who left and removed theirs is not shown at all.
  return data.filter((row) => row.left_at === null || row.keep_on_leave === true);
}

/** Every pool I am in now, most recently joined first. */
export async function getMyPools(supabase: DuringClient, me: string): Promise<MyPool[]> {
  const { data: mine, error } = await supabase
    .from('pool_members')
    .select('pool_id, joined_at, pool:pools(id, name)')
    .eq('user_id', me)
    .is('left_at', null)
    .order('joined_at', { ascending: false })
    .returns<{ pool_id: string; joined_at: string; pool: Pick<PoolRow, 'id' | 'name'> }[]>();
  if (error) throw error;
  const ids = mine.map((row) => row.pool_id);
  if (ids.length === 0) return [];

  const [members, latest] = await Promise.all([
    membersOf(supabase, ids),
    getPoolActivity(supabase, me, ids),
  ]);

  return mine.map((row) => ({
    id: row.pool.id,
    name: row.pool.name,
    members: orderMembers(
      members.filter((m) => m.pool_id === row.pool_id && m.left_at === null).map(toMember),
      me,
    ),
    latestActivity: latest.get(row.pool_id) ?? null,
  }));
}

/**
 * What happened in each pool: the newest ripple someone else wrote on
 * anything placed or joint there, or the newest reaction or reply someone
 * else left on a ripple of mine there (H25), by pool (for the "new since my
 * last visit" dots).
 */
export async function getPoolActivity(
  supabase: DuringClient,
  me: string,
  ids: string[],
): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (ids.length === 0) return latest;
  const [placements, joints] = await Promise.all([
    supabase
      .from('splash_placements')
      .select('pool_id, splash_id')
      .in('pool_id', ids)
      .eq('shared', true),
    supabase.from('splashes').select('id, pool_id').in('pool_id', ids).is('owner_id', null),
  ]);
  if (placements.error) throw placements.error;
  if (joints.error) throw joints.error;
  const poolOf = new Map<string, string>();
  for (const p of placements.data) poolOf.set(p.splash_id, p.pool_id);
  for (const j of joints.data) if (j.pool_id) poolOf.set(j.id, j.pool_id);
  if (poolOf.size === 0) return latest;
  const { data: ripples, error } = await supabase
    .from('ripples')
    .select('splash_id, created_at')
    .in('splash_id', [...poolOf.keys()])
    .neq('author_id', me);
  if (error) throw error;
  const note = (splashId: string | null, at: string) => {
    const pool = splashId ? poolOf.get(splashId) : undefined;
    if (!pool) return;
    const seen = latest.get(pool);
    if (!seen || at > seen) latest.set(pool, at);
  };
  for (const r of ripples) note(r.splash_id, r.created_at);
  // Reactions and replies on my ripples there count too (H25).
  const responded = await latestResponseOnMine(supabase, me, [...poolOf.keys()]);
  for (const [splashId, at] of responded) note(splashId, at);
  return latest;
}

/** One pool as its home reads it. Null when I am not a current member (RLS shows nothing). */
export async function getPoolView(
  supabase: DuringClient,
  poolId: string,
  me: string,
): Promise<PoolView | null> {
  const { data: pool, error } = await supabase
    .from('pools')
    .select('id, name, owner_id, photo_version, invite_all_by_default')
    .eq('id', poolId)
    .maybeSingle();
  if (error) throw error;
  if (!pool) return null;

  const [members, lanes, links, placements, joints, invites, myRow] = await Promise.all([
    membersOf(supabase, [poolId]),
    supabase.from('pool_lanes').select('*').eq('pool_id', poolId).order('position'),
    supabase
      .from('lane_mappings')
      .select('pool_lane_id, my_category_id, is_default, share_by_default, is_home')
      .eq('pool_id', poolId)
      .eq('user_id', me)
      .order('created_at'),
    supabase
      .from('splash_placements')
      .select('splash_id, pool_id, pool_lane_id, shared, invite_all, splash:splashes(*)')
      .eq('pool_id', poolId)
      .returns<
        {
          splash_id: string;
          pool_id: string;
          pool_lane_id: string;
          shared: boolean;
          invite_all: boolean;
          splash: Splash | null;
        }[]
      >(),
    supabase.from('splashes').select('*').eq('pool_id', poolId).is('owner_id', null),
    supabase
      .from('pool_invites')
      .select('*')
      .eq('pool_id', poolId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('pool_members')
      .select('on_home')
      .eq('pool_id', poolId)
      .eq('user_id', me)
      .maybeSingle(),
  ]);
  for (const result of [lanes, links, placements, joints, invites]) {
    if (result.error) throw result.error;
  }

  // My own switched-off placements come back to me (I am their author); the
  // pool shows only what is shared, to me as to everyone.
  const shown = (placements.data ?? []).filter((p) => p.shared && p.splash);
  const splashes: Splash[] = [...shown.map((p) => p.splash!), ...(joints.data ?? [])];
  const splashIds = splashes.map((s) => s.id);

  let ripples: PoolRipple[] = [];
  if (splashIds.length > 0) {
    const { data, error: rippleError } = await supabase
      .from('ripples')
      .select(RIPPLE_COLUMNS)
      .in('splash_id', splashIds)
      .is('parent_ripple_id', null);
    if (rippleError) throw rippleError;
    // RLS already hides everyone else's locked blocks; mine come back to me
    // as their author, and a pool shows me what it shows the others.
    const mineIds = data.filter((r) => r.author_id === me).map((r) => r.id);
    const locked = new Set<string>();
    if (mineIds.length > 0) {
      const { data: locks } = await supabase
        .from('ripple_audience')
        .select('ripple_id')
        .eq('target_type', 'lock')
        .in('ripple_id', mineIds);
      for (const row of locks ?? []) locked.add(row.ripple_id);
    }
    ripples = data.filter((r) => !locked.has(r.id));
  }

  return {
    pool: {
      id: pool.id,
      name: pool.name,
      ownerId: pool.owner_id,
      inviteAllByDefault: pool.invite_all_by_default,
      myOnHome: myRow.data?.on_home ?? true,
      photoVersion: pool.photo_version,
      photo: null,
    },
    members: orderMembers(members.map(toMember), me),
    lanes: lanes.data ?? [],
    myLinks: (links.data ?? []).map((l) => ({
      poolLaneId: l.pool_lane_id,
      myCategoryId: l.my_category_id,
      isDefault: l.is_default,
      shareByDefault: l.share_by_default === true,
      isHome: l.is_home,
    })),
    placements: shown.map((p) => ({
      splashId: p.splash_id,
      poolId: p.pool_id,
      poolLaneId: p.pool_lane_id,
      shared: p.shared,
      inviteAll: p.invite_all,
      ownerId: p.splash!.owner_id ?? '',
    })),
    splashes,
    ripples,
    invites: invites.data ?? [],
    together: await getJointTogether(
      supabase,
      (joints.data ?? []).map((j) => j.id),
    ),
    placementTogether: Object.fromEntries(
      Object.entries(
        await getPlacementTogether(
          supabase,
          shown.map((p) => p.splash_id),
        ),
      ).map(([id, byPool]) => [id, byPool[poolId] ?? []]),
    ),
    layouts: await getPoolLayouts(supabase, poolId),
    responded: await getRippleResponses(
      supabase,
      ripples.map((r) => r.id),
    ),
    lockedIds: await getLockedIds(
      supabase,
      ripples.flatMap((r) => (r.author_id === me ? [r.id] : [])),
    ),
    respondedAt: await getResponsesOnMine(
      supabase,
      me,
      ripples.flatMap((r) =>
        r.author_id === me && r.splash_id ? [{ id: r.id, splashKey: r.splash_id }] : [],
      ),
    ),
  };
}

/**
 * Every link of mine across my pools, with the pool's name (advanced, 0033):
 * what Audience preselects from (a lane's default pool lane, shared only
 * when that default says so) and where Home shows a pool lane's records
 * (its home lane).
 */
export type MyLink = {
  myCategoryId: string;
  poolId: string;
  poolName: string;
  poolLaneId: string;
} & LinkMarkers;

export async function getMyLinks(supabase: DuringClient, me: string): Promise<MyLink[]> {
  // Two reads: lane_mappings reaches pools only through pool_lanes' composite
  // key, which PostgREST cannot embed by name.
  const [{ data: links, error }, pools] = await Promise.all([
    supabase
      .from('lane_mappings')
      .select('my_category_id, pool_id, pool_lane_id, is_default, share_by_default, is_home')
      .eq('user_id', me)
      .order('created_at'),
    getMyPoolNames(supabase, me),
  ]);
  if (error) throw error;
  const nameOf = new Map(pools.map((p) => [p.id, p.name]));
  // A pool I have left is not in my pools, so its links drop out here.
  return links
    .filter((row) => nameOf.has(row.pool_id))
    .map((row) => ({
      myCategoryId: row.my_category_id,
      poolId: row.pool_id,
      poolName: nameOf.get(row.pool_id)!,
      poolLaneId: row.pool_lane_id,
      isDefault: row.is_default,
      shareByDefault: row.share_by_default === true,
      isHome: row.is_home,
    }));
}

/** A pool's lane as Audience offers it: emoji and name (0033). */
export type PoolLaneChip = { id: string; name: string; icon: string | null };

/** A current member as With offers them: a face (0035). */
export type PoolFace = { id: string; name: string; initials: string };

/**
 * The pools I am in now, by name, with their lanes in order: the Audience
 * sheet's rows and chips, and Home's monograms.
 */
export async function getMyPoolNames(
  supabase: DuringClient,
  me: string,
): Promise<
  {
    id: string;
    name: string;
    photoVersion: number | null;
    lanes: PoolLaneChip[];
    members: PoolFace[];
    /** What I wrote here shows on my Home (0039). */
    onHome: boolean;
  }[]
> {
  const { data, error } = await supabase
    .from('pool_members')
    .select(
      'on_home, pool:pools(id, name, photo_version, lanes:pool_lanes(id, name, icon, position))',
    )
    .eq('user_id', me)
    .is('left_at', null)
    .order('joined_at', { ascending: false })
    .returns<
      {
        on_home: boolean;
        pool: {
          id: string;
          name: string;
          photo_version: number | null;
          lanes: (PoolLaneChip & { position: number })[] | null;
        } | null;
      }[]
    >();
  if (error) throw error;
  const members = await membersOf(
    supabase,
    data.flatMap((row) => (row.pool ? [row.pool.id] : [])),
  );
  return data.flatMap((row) =>
    row.pool
      ? [
          {
            id: row.pool.id,
            name: row.pool.name,
            photoVersion: row.pool.photo_version,
            lanes: [...(row.pool.lanes ?? [])]
              .sort((a, b) => a.position - b.position)
              .map(({ id, name, icon }) => ({ id, name, icon })),
            members: members
              .filter((m) => m.pool_id === row.pool!.id && m.left_at === null)
              .map(toMember)
              .map((m) => ({ id: m.userId, name: m.name, initials: m.initials })),
            onHome: row.on_home,
          },
        ]
      : [],
  );
}

/**
 * Who each of these records is with, pool by pool (0035,
 * `placement_together`): every current member under Everyone, else the
 * picked ones still there; never its owner. RLS-shaped: the owner reads
 * all; a member, the pools they are in while shared.
 */
export async function getPlacementTogether(
  supabase: DuringClient,
  splashIds: string[],
): Promise<Record<string, Record<string, string[]>>> {
  if (splashIds.length === 0) return {};
  const { data, error } = await supabase.rpc('placement_together', { p_splashes: splashIds });
  if (error) throw error;
  const by: Record<string, Record<string, string[]>> = {};
  for (const row of data ?? []) ((by[row.splash_id] ??= {})[row.pool_id] ??= []).push(row.user_id);
  return by;
}

/** The faces I picked on my record, pool by pool (0035): the rows, not Everyone. */
export async function getPlacementPicks(
  supabase: DuringClient,
  splashId: string,
): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('joint_invitees')
    .select('pool_id, user_id')
    .eq('splash_id', splashId)
    .not('pool_id', 'is', null);
  if (error) throw error;
  const by: Record<string, string[]> = {};
  for (const row of data) if (row.pool_id) (by[row.pool_id] ??= []).push(row.user_id);
  return by;
}

/** My own ripples on others' records (0035), with what Home shows them under. */
export type MyThreadRipple = {
  rippleId: string;
  splashId: string;
  ownerId: string;
  title: string;
  icon: string | null;
  declaredStart: string | null;
  declaredEnd: string | null;
  poolId: string;
  poolName: string | null;
  poolLaneId: string;
  poolLane: { name: string; icon: string | null } | null;
  shared: boolean;
};

export async function getMyThreadRipples(supabase: DuringClient): Promise<MyThreadRipple[]> {
  const { data, error } = await supabase.rpc('my_thread_ripples');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    rippleId: r.ripple_id,
    splashId: r.splash_id,
    ownerId: r.owner_id,
    title: r.title,
    icon: r.icon,
    declaredStart: r.declared_start,
    declaredEnd: r.declared_end,
    poolId: r.pool_id,
    poolName: r.pool_name,
    poolLaneId: r.pool_lane_id,
    poolLane: r.pool_lane_name ? { name: r.pool_lane_name, icon: r.pool_lane_icon } : null,
    shared: r.shared,
  }));
}

/**
 * My ripples on a joint splash I can no longer read (0041), each with the
 * pool it was in: Home places them in that pool's column, "A pool you left".
 */
export async function getMyLeftPoolRipples(supabase: DuringClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('my_left_pool_ripples');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.ripple_id, r.pool_id]));
}

/**
 * Who each joint record is together with now (0033, `joint_together`): every
 * current member under Everyone — later joiners included — else its picked
 * invitees still in the pool. "Add your side" waits for these, less writers.
 */
export async function getJointTogether(
  supabase: DuringClient,
  splashIds: string[],
): Promise<Record<string, string[]>> {
  if (splashIds.length === 0) return {};
  const { data, error } = await supabase.rpc('joint_together', { p_splashes: splashIds });
  if (error) throw error;
  const by: Record<string, string[]> = {};
  for (const row of data ?? []) (by[row.splash_id] ??= []).push(row.user_id);
  return by;
}

/** A joint record's picked invitees (0033): fixed rows, beside Everyone. */
export async function getJointInvitees(
  supabase: DuringClient,
  splashIds: string[],
): Promise<Record<string, string[]>> {
  if (splashIds.length === 0) return {};
  const { data, error } = await supabase
    .from('joint_invitees')
    .select('splash_id, user_id')
    .in('splash_id', splashIds)
    // A joint record's own; rows with a pool are per-pool invitees on my record (0035).
    .is('pool_id', null)
    .order('invited_at');
  if (error) throw error;
  const by: Record<string, string[]> = {};
  for (const row of data) (by[row.splash_id] ??= []).push(row.user_id);
  return by;
}

/** My posts' placements in pools I am in now, switched on or off. */
export async function getMyPlacements(supabase: DuringClient, me: string): Promise<Placement[]> {
  const { data, error } = await supabase
    .from('splash_placements')
    .select(
      'splash_id, pool_id, pool_lane_id, shared, invite_all, splash:splashes!inner(owner_id), pool:pools(id)',
    )
    .eq('splash.owner_id', me)
    .returns<
      {
        splash_id: string;
        pool_id: string;
        pool_lane_id: string;
        shared: boolean;
        invite_all: boolean;
        pool: { id: string } | null;
      }[]
    >();
  if (error) throw error;
  return data
    .filter((row) => row.pool)
    .map((row) => ({
      splashId: row.splash_id,
      poolId: row.pool_id,
      poolLaneId: row.pool_lane_id,
      shared: row.shared,
      inviteAll: row.invite_all,
    }));
}

/** Joint splashes I have written in, for Home (H23): my ripples on them show there. */
export async function getJointSplashes(supabase: DuringClient, ids: string[]): Promise<Splash[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('splashes')
    .select('*')
    .in('id', ids)
    .is('owner_id', null);
  if (error) throw error;
  return data;
}

/**
 * Joint splashes I made (H23), readable while I am in their pool: a joint
 * splash written as a title alone has no ripple of mine to bring it Home.
 */
export async function getMyJointShells(supabase: DuringClient, me: string): Promise<Splash[]> {
  const { data, error } = await supabase
    .from('splashes')
    .select('*')
    .is('owner_id', null)
    .eq('created_by', me);
  if (error) throw error;
  return data;
}

/**
 * Where each of my splashes is or was in a pool (0015), one tag per pool:
 * the live pool and pool lane names while I am in it, so renames show at
 * once; the placement's frozen snapshot once I have left; and a recorded
 * origin for every pool since deleted. Only placements still switched on.
 */
export async function getMyOriginTags(
  supabase: DuringClient,
  me: string,
): Promise<Map<string, string[]>> {
  const [placed, origins] = await Promise.all([
    supabase
      .from('splash_placements')
      .select(
        'splash_id, shared, origin_pool_name, origin_pool_lane_name, origin_pool_lane_icon, pool:pools(name), lane:pool_lanes(name, icon), splash:splashes!inner(owner_id)',
      )
      .eq('splash.owner_id', me)
      .eq('shared', true)
      .returns<
        {
          splash_id: string;
          origin_pool_name: string | null;
          origin_pool_lane_name: string | null;
          origin_pool_lane_icon: string | null;
          pool: { name: string } | null;
          lane: { name: string; icon: string | null } | null;
        }[]
      >(),
    supabase
      .from('splash_origins')
      .select('splash_id, pool_name, pool_lane_name, pool_lane_icon')
      .order('recorded_at'),
  ]);
  if (placed.error) throw placed.error;
  if (origins.error) throw origins.error;
  const tags = new Map<string, string[]>();
  const add = (id: string, tag: string): void => {
    tags.set(id, [...(tags.get(id) ?? []), tag]);
  };
  for (const p of placed.data) {
    const live = p.pool && p.lane;
    const pool = live ? p.pool!.name : p.origin_pool_name;
    const lane = live ? p.lane!.name : p.origin_pool_lane_name;
    const icon = live ? p.lane!.icon : p.origin_pool_lane_icon;
    if (pool && lane) add(p.splash_id, originTag(pool, icon, lane));
  }
  for (const o of origins.data) {
    add(o.splash_id, originTag(o.pool_name, o.pool_lane_icon, o.pool_lane_name));
  }
  return tags;
}
