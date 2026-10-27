'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { removeRippleMedia } from '@/lib/media';
import { createClient } from '@/lib/supabase/server';

export type Done = { ok: true } | { ok: false; message: string };
export type Made = { ok: true; id: string } | { ok: false; message: string };

const ICON = z.string().trim().max(16).nullable();
const DESCRIPTION = z.string().trim().max(80).nullable();
/** A link's direction (0017); absent reads as both. */
const DIRECTION = z.enum(['out', 'both', 'in']);
const LINKS = z
  .array(
    z.object({
      poolLaneId: z.uuid(),
      myCategoryId: z.uuid().nullable(),
      direction: DIRECTION.optional(),
    }),
  )
  .max(24);

/** Every surface a pool touches re-reads. */
function revalidatePool(poolId: string | null = null): void {
  revalidatePath('/');
  revalidatePath('/pool');
  if (poolId) revalidatePath(`/pool/${poolId}`);
}

/** A database refusal as the author should read it: our own words, else a plain one. */
function said(error: { message: string; code?: string } | null): string {
  if (!error) return 'That did not go through. Try again.';
  if (error.code === '42501' && /no longer valid/.test(error.message)) return error.message;
  if (error.code === '42501' && /ripples? by other members/.test(error.message)) {
    return error.message;
  }
  // 0019: a lane of mine sends into one pool lane per pool.
  if (error.code === '23505' && /lane_mappings_one_sender/.test(error.message)) {
    return 'Each of your lanes can share into only one lane of this Pool.';
  }
  if (error.code === '42501' && /creator renames/.test(error.message)) {
    return 'Only the Pool’s creator can rename it.';
  }
  if (error.code === '42501') return 'You are not a member of this Pool.';
  return error.message;
}

const NewPool = z.object({
  name: z.string().trim().min(1).max(60),
  lanes: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        icon: ICON,
        description: DESCRIPTION,
        myCategoryId: z.uuid().nullable(),
        direction: DIRECTION.optional(),
      }),
    )
    .min(1)
    .max(12),
  includeHistory: z.boolean(),
});

/** "Open a new Pool", steps 1 and 2 as one act (0011 `create_pool`). */
export async function createPool(input: z.infer<typeof NewPool>): Promise<Made> {
  const parsed = NewPool.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'A Pool needs a name and at least one lane.' };
  const pool = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_pool', {
    p_name: pool.name,
    // The kind is no longer chosen or written (2026-10-23): the column is
    // nullable with no default, so it stays null. The function still takes
    // the argument, and the generated type reads it as required.
    p_kind: null as unknown as Database['public']['Enums']['pool_kind'],
    p_lanes: pool.lanes.map((lane) => ({
      name: lane.name,
      icon: lane.icon,
      description: lane.description,
      my_category_id: lane.myCategoryId,
      direction: lane.direction ?? 'both',
    })),
    p_include_history: pool.includeHistory,
  });
  if (error || !data) return { ok: false, message: said(error) };
  revalidatePool(data);
  return { ok: true, id: data };
}

const Join = z.object({
  token: z.string().min(1).max(64),
  links: LINKS,
  includeHistory: z.boolean(),
});

/** Joining from `/join/[token]`: the token is checked again in the database. */
export async function joinPool(input: z.infer<typeof Join>): Promise<Made> {
  const parsed = Join.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'This invite link is no longer valid.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_pool', {
    p_token: parsed.data.token,
    p_links: parsed.data.links.map((l) => ({
      pool_lane_id: l.poolLaneId,
      my_category_id: l.myCategoryId,
      direction: l.direction ?? 'both',
    })),
    p_include_history: parsed.data.includeHistory,
  });
  if (error || !data) return { ok: false, message: said(error) };
  revalidatePool(data);
  return { ok: true, id: data };
}

/** Pool settings: change which of my lanes each pool lane takes. */
export async function setLaneLinks(poolId: string, links: z.infer<typeof LINKS>): Promise<Done> {
  const parsed = z.object({ poolId: z.uuid(), links: LINKS }).safeParse({ poolId, links });
  if (!parsed.success) return { ok: false, message: 'Those links are not valid.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_lane_links', {
    p_pool: poolId,
    p_links: parsed.data.links.map((l) => ({
      pool_lane_id: l.poolLaneId,
      my_category_id: l.myCategoryId,
      direction: l.direction ?? 'both',
    })),
  });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** The creator sets or clears the pool's photo (0024); the bytes went up from the browser first. */
export async function setPoolPhoto(poolId: string, on: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'No such Pool.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pool_photo', { p_pool: poolId, p_on: on });
  if (error) {
    return {
      ok: false,
      message:
        error.code === '42501' ? 'Only the Pool’s creator can change its photo.' : error.message,
    };
  }
  revalidatePool(poolId);
  revalidatePath('/');
  return { ok: true };
}

/** Pool settings: the creator renames the pool (0021). */
export async function renamePool(poolId: string, name: string): Promise<Done> {
  const parsed = z
    .object({ poolId: z.uuid(), name: z.string().trim().min(1).max(60) })
    .safeParse({ poolId, name });
  if (!parsed.success) return { ok: false, message: 'A Pool needs a name of 1–60 characters.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('rename_pool', {
    p_pool: parsed.data.poolId,
    p_name: parsed.data.name,
  });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  revalidatePath('/');
  return { ok: true };
}

export type Invite =
  { ok: true; id: string; token: string; expiresAt: string } | { ok: false; message: string };

/** "Create invite link": a fresh token, seven days, revocable. */
export async function createInvite(poolId: string): Promise<Invite> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'No such Pool.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_invite', { p_pool: poolId });
  const row = data?.[0];
  if (error || !row) return { ok: false, message: said(error) };
  // Readable by members, so the link can be revoked the moment it exists.
  const { data: made } = await supabase
    .from('pool_invites')
    .select('id')
    .eq('token', row.token)
    .single();
  if (!made) return { ok: false, message: 'The link was made but could not be read back.' };
  revalidatePool(poolId);
  return { ok: true, id: made.id, token: row.token, expiresAt: row.expires_at };
}

export async function revokeInvite(poolId: string, inviteId: string): Promise<Done> {
  if (!z.uuid().safeParse(inviteId).success) return { ok: false, message: 'No such invite.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_invite', { p_invite: inviteId });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** "Leave Pool": keep my records here (Former member), or hide them. Never deletes. */
export async function leavePool(poolId: string, keep: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'No such Pool.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('leave_pool', { p_pool: poolId, p_keep: keep });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

const LaneEdit = z.object({
  id: z.uuid().nullable(),
  poolId: z.uuid(),
  name: z.string().trim().min(1).max(40),
  icon: ICON,
  description: DESCRIPTION,
});

/** A pool lane named, re-iconed or described by any member (no roles yet), or added. */
export async function savePoolLane(input: z.infer<typeof LaneEdit>): Promise<Done> {
  const parsed = LaneEdit.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'A lane needs a name.' };
  const lane = parsed.data;
  const supabase = await createClient();
  const fields = {
    name: lane.name,
    icon: lane.icon || null,
    description: lane.description || null,
  };
  if (lane.id) {
    const { error } = await supabase.from('pool_lanes').update(fields).eq('id', lane.id);
    if (error) return { ok: false, message: said(error) };
  } else {
    const { data: last } = await supabase
      .from('pool_lanes')
      .select('position')
      .eq('pool_id', lane.poolId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from('pool_lanes')
      .insert({ ...fields, pool_id: lane.poolId, position: (last?.position ?? -1) + 1 });
    if (error) return { ok: false, message: said(error) };
  }
  revalidatePool(lane.poolId);
  return { ok: true };
}

/**
 * One post's audience in one pool (the Audience sheet). On: placed in the
 * pool lane my lane is linked to — the database refuses a lane I never
 * linked (C5). Off: kept, switched off, so off stays distinct from never.
 */
export async function setPlacement(
  splashId: string,
  poolId: string,
  shared: boolean,
): Promise<Done> {
  const parsed = z
    .object({ splashId: z.uuid(), poolId: z.uuid(), shared: z.boolean() })
    .safeParse({ splashId, poolId, shared });
  if (!parsed.success) return { ok: false, message: 'That audience is not valid.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to change this.' };

  const lane = await poolLaneFor(supabase, user.id, splashId, poolId);
  if (shared && !lane) return { ok: false, message: 'This lane is not linked in that Pool.' };

  const { data: existing } = await supabase
    .from('splash_placements')
    .select('splash_id')
    .eq('splash_id', splashId)
    .eq('pool_id', poolId)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from('splash_placements')
        .update({
          shared,
          updated_at: new Date().toISOString(),
          ...(shared && lane ? { pool_lane_id: lane } : {}),
        })
        .eq('splash_id', splashId)
        .eq('pool_id', poolId)
    : shared && lane
      ? await supabase
          .from('splash_placements')
          .insert({ splash_id: splashId, pool_id: poolId, pool_lane_id: lane })
      : { error: null };
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  revalidatePath(`/splash/${splashId}`);
  return { ok: true };
}

/** Where a post of mine lands in a pool: the pool lane its lane is linked to there (H24). */
async function poolLaneFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  me: string,
  splashId: string,
  poolId: string,
): Promise<string | null> {
  const { data: splash } = await supabase
    .from('splashes')
    .select('declared_lane_id, owner_id')
    .eq('id', splashId)
    .maybeSingle();
  if (!splash || splash.owner_id !== me) return null;
  const lane = splash.declared_lane_id;
  if (!lane) return null;
  const { data: link } = await supabase
    .from('lane_mappings')
    .select('pool_lane_id')
    .eq('user_id', me)
    .eq('pool_id', poolId)
    .eq('my_category_id', lane)
    .maybeSingle();
  return link?.pool_lane_id ?? null;
}

/** A new post's audience, written right after the post (compose). */
export async function placeNewSplash(splashId: string, poolIds: string[]): Promise<Done> {
  for (const poolId of poolIds) {
    const done = await setPlacement(splashId, poolId, true);
    if (!done.ok) return done;
  }
  return { ok: true };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A splash's last day, when its range has one: the database's make-functions
 * take the first day only. Returns a message on failure, else null.
 */
async function endRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  splashId: string,
  end: string | null,
): Promise<string | null> {
  if (!end) return null;
  const { error } = await supabase
    .from('splashes')
    .update({ declared_end: end })
    .eq('id', splashId);
  return error ? said(error) : null;
}

const Joint = z.object({
  id: z.uuid(),
  poolId: z.uuid(),
  poolLaneId: z.uuid(),
  title: z.string().trim().max(120),
  icon: ICON,
  body: z.string().trim().max(8000),
  /** The splash's range, which every ripple on it takes (H24). */
  declaredStart: z.string().regex(ISO_DAY),
  declaredEnd: z.string().regex(ISO_DAY).nullable(),
  /** My ripple's own day inside that range (0031). */
  blockDay: z.string().regex(ISO_DAY).nullable().optional(),
});

/** A joint splash, opened by a member on a pool lane, with my first ripple on it. */
export async function createJointSplash(input: z.infer<typeof Joint>): Promise<Made> {
  const parsed = Joint.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That joint splash is incomplete.' };
  const joint = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to drop this.' };

  const { error } = await supabase.rpc('create_joint_splash', {
    p_id: joint.id,
    p_pool: joint.poolId,
    p_pool_lane: joint.poolLaneId,
    p_title: joint.title,
    ...(joint.icon ? { p_icon: joint.icon } : {}),
    p_declared_start: joint.declaredStart,
  });
  if (error) return { ok: false, message: said(error) };
  const ended = await endRange(supabase, joint.id, joint.declaredEnd);
  if (ended) {
    await supabase.rpc('delete_joint_splash', { p_splash: joint.id });
    return { ok: false, message: ended };
  }

  // My ripple takes no lane (H24): where the splash shows on my Home is
  // derived from my link to its pool lane.
  if (joint.body) {
    const { error: blockError } = await supabase.from('ripples').insert({
      author_id: user.id,
      note: joint.body,
      splash_id: joint.id,
      ...(joint.blockDay && joint.declaredEnd ? { occurred_on: joint.blockDay } : {}),
    });
    if (blockError) {
      // The band without the words that opened it is not what was dropped.
      await supabase.rpc('delete_joint_splash', { p_splash: joint.id });
      return { ok: false, message: said(blockError) };
    }
  }
  revalidatePool(joint.poolId);
  return { ok: true, id: joint.id };
}

/** Delete a joint splash: only while every ripple on it is mine (0011). */
export async function deleteJointSplash(poolId: string, splashId: string): Promise<Done> {
  if (!z.uuid().safeParse(splashId).success) return { ok: false, message: 'No such splash.' };
  const supabase = await createClient();
  const { data: blocks } = await supabase
    .from('ripples')
    .select('id, media')
    .eq('splash_id', splashId);
  const { error } = await supabase.rpc('delete_joint_splash', { p_splash: splashId });
  if (error) return { ok: false, message: said(error) };
  // Hard deletes include the objects (CLAUDE.md); every ripple was mine.
  await removeRippleMedia((blocks ?? []).flatMap((b) => b.media));
  revalidatePool(poolId);
  return { ok: true };
}

const OwnDrop = z.object({
  id: z.uuid(),
  poolId: z.uuid(),
  poolLaneId: z.uuid(),
  title: z.string().trim().max(120),
  icon: ICON,
  body: z.string().trim().max(8000),
  media: z.array(z.string()).max(8),
  /** The splash's range, which every ripple on it takes (H24). */
  declaredStart: z.string().regex(ISO_DAY),
  declaredEnd: z.string().regex(ISO_DAY).nullable(),
  /** My ripple's own day inside that range (0031). */
  blockDay: z.string().regex(ISO_DAY).nullable().optional(),
});

/**
 * "Just mine" (0014): my splash on a pool lane, linked to no lane of mine.
 * The splash and its one placement are made together by the database
 * (`create_own_pool_splash`); the first ripple follows with no lane. A
 * ripple that will not land takes the splash back with it.
 */
export async function dropOwnPoolSplash(input: z.infer<typeof OwnDrop>): Promise<Made> {
  const parsed = OwnDrop.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That splash is incomplete.' };
  const drop = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to drop this.' };

  const hasBlock = Boolean(drop.body) || drop.media.length > 0;
  const { error } = await supabase.rpc('create_own_pool_splash', {
    p_id: drop.id,
    p_pool: drop.poolId,
    p_pool_lane: drop.poolLaneId,
    p_title: drop.title,
    ...(drop.icon ? { p_icon: drop.icon } : {}),
    p_declared_start: drop.declaredStart,
  });
  if (error) return { ok: false, message: said(error) };
  const ended = await endRange(supabase, drop.id, drop.declaredEnd);
  if (ended) {
    await supabase.from('splashes').delete().eq('id', drop.id);
    return { ok: false, message: ended };
  }

  if (hasBlock) {
    const { error: blockError } = await supabase.from('ripples').insert({
      author_id: user.id,
      note: drop.body || null,
      media: drop.media,
      splash_id: drop.id,
      ...(drop.blockDay && drop.declaredEnd ? { occurred_on: drop.blockDay } : {}),
    });
    if (blockError) {
      // Deleting the splash takes its placement with it (0014 allows that).
      await supabase.from('splashes').delete().eq('id', drop.id);
      return { ok: false, message: said(blockError) };
    }
  }
  revalidatePool(drop.poolId);
  return { ok: true, id: drop.id };
}

/**
 * Delete a pool for everyone (0015), the creator only — the database checks
 * that and refuses a pool whose creator's account is gone. Nobody's words go
 * with it: Just-mine splashes move into a new lane of their author's, each
 * author's joint ripples become one post of theirs, shared splashes stay.
 */
export async function deletePool(poolId: string): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'No such Pool.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_pool', { p_pool: poolId });
  if (error) {
    return {
      ok: false,
      message: error.code === '42501' ? 'Only the Pool’s creator can delete it.' : error.message,
    };
  }
  revalidatePool(poolId);
  return { ok: true };
}
