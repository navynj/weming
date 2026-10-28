'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { removeRippleMedia } from '@/lib/media';
import { createClient } from '@/lib/supabase/server';
import { reported } from '@/lib/report-failure';
import { pushAfter } from '@/lib/notifications/after';

export type Done = { ok: true } | { ok: false; message: string };
export type Made = { ok: true; id: string } | { ok: false; message: string };

const ICON = z.string().trim().max(16).nullable();
const DESCRIPTION = z.string().trim().max(80).nullable();

/** Every surface a pool touches re-reads. */
function revalidatePool(poolId: string | null = null): void {
  revalidatePath('/');
  revalidatePath('/pool');
  if (poolId) revalidatePath(`/pool/${poolId}`);
}

/** What a dead invite link says, here and on the join page (0059). */
const DEAD_LINK = 'This invite link no longer works. Ask for a new one.';

/** A database refusal as the author should read it: our own words, else a plain one. */
function said(error: { message: string; code?: string } | null): string {
  if (!error) return 'That did not go through. Try again.';
  // A dead invite, in plain words (0059).
  if (error.code === '42501' && /no longer valid/.test(error.message)) return DEAD_LINK;
  if (error.code === '42501' && /ripples? by other members/.test(error.message)) {
    return error.message;
  }
  if (error.code === '42501' && /together here/.test(error.message)) return error.message;
  // The owner's rules (0063, 0064) say themselves.
  if (error.code === '42501' && /can.t join this Pool|owner/i.test(error.message)) {
    return error.message;
  }
  if (
    error.code === '22023' &&
    /Pick someone|aren.t in this Pool|remove yourself/.test(error.message)
  ) {
    return error.message;
  }
  if (error.code === '42501') return 'You’re not in this Pool anymore.';
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
      }),
    )
    .min(1)
    .max(12),
});

/**
 * "Open a new Pool" (0011 `create_pool`): the pool, its lanes and my
 * membership as one act. No lane of mine is connected (H45).
 */
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
      my_category_id: null,
    })),
    // Retired with matching on create (0033); the argument stays until 0036.
    p_include_history: false,
  });
  if (error || !data) return { ok: false, message: said(error) };
  revalidatePool(data);
  return { ok: true, id: data };
}

const Join = z.object({ token: z.string().min(1).max(64) });

/**
 * Joining from `/join/[token]`: the token is checked again in the database.
 * Nothing about lanes (2026-10-26, 0033): every pool lane starts unconnected.
 */
export async function joinPool(input: z.infer<typeof Join>): Promise<Made> {
  return reported('join', () => joinPoolWork(input));
}

async function joinPoolWork(input: z.infer<typeof Join>): Promise<Made> {
  const parsed = Join.safeParse(input);
  if (!parsed.success) return { ok: false, message: DEAD_LINK };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_pool', {
    p_token: parsed.data.token,
    p_links: [],
    p_include_history: false,
  });
  if (error || !data) return { ok: false, message: said(error) };
  revalidatePool(data);
  return { ok: true, id: data };
}

/** Pool settings: "Invite everyone to new posts by default" (0033), any current member. */
export async function setPoolInviteAll(poolId: string, on: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pool_invite_all', { p_pool: poolId, p_on: on });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** Pool settings: what I wrote in this pool shows on my Home, or not (0039). Mine alone. */
export async function setPoolOnHome(poolId: string, on: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pool_on_home', { p_pool: poolId, p_on: on });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** The creator sets or clears the pool's photo (0024); the bytes went up from the browser first. */
export async function setPoolPhoto(poolId: string, on: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pool_photo', { p_pool: poolId, p_on: on });
  if (error) {
    return {
      ok: false,
      message:
        error.code === '42501' ? 'Only someone in this Pool can change its photo.' : error.message,
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
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
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
  if (!made)
    return {
      ok: false,
      message: 'The link was made but didn’t show up. Close this and open it again.',
    };
  revalidatePool(poolId);
  return { ok: true, id: made.id, token: row.token, expiresAt: row.expires_at };
}

export async function revokeInvite(poolId: string, inviteId: string): Promise<Done> {
  if (!z.uuid().safeParse(inviteId).success) return { ok: false, message: 'That link is gone.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('revoke_invite', { p_invite: inviteId });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** "Leave Pool": keep my records here (Former member), or hide them. Never deletes. */
export async function leavePool(poolId: string, keep: boolean): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
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

/**
 * A pool lane named, re-iconed or described by any member (no roles yet), or
 * added; a new one answers with its id, so the lane rows can order it (H42b).
 */
export async function savePoolLane(
  input: z.infer<typeof LaneEdit>,
): Promise<Done & { id?: string }> {
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
    const { data: made, error } = await supabase
      .from('pool_lanes')
      .insert({ ...fields, pool_id: lane.poolId, position: (last?.position ?? -1) + 1 })
      .select('id')
      .single();
    if (error) return { ok: false, message: said(error) };
    revalidatePool(lane.poolId);
    return { ok: true, id: made.id };
  }
  revalidatePool(lane.poolId);
  return { ok: true, id: lane.id };
}

/**
 * A pool's lanes in the order given, by any current member, as renaming is
 * (H42b): each lane's position, its pool named too so an id from another
 * pool changes nothing. RLS holds who may (0010: current members update
 * position).
 */
export async function reorderPoolLanes(poolId: string, ids: string[]): Promise<Done> {
  const parsed = z
    .object({ poolId: z.uuid(), ids: z.array(z.uuid()).min(1).max(64) })
    .safeParse({ poolId, ids });
  if (!parsed.success) return { ok: false, message: 'That order is not a list of lanes.' };
  const supabase = await createClient();
  for (const [position, id] of parsed.data.ids.entries()) {
    const { data, error } = await supabase
      .from('pool_lanes')
      .update({ position })
      .eq('id', id)
      .eq('pool_id', parsed.data.poolId)
      .select('id');
    if (error) return { ok: false, message: said(error) };
    if (!data?.length) return { ok: false, message: 'Only a member of this pool can do that.' };
  }
  revalidatePool(parsed.data.poolId);
  return { ok: true };
}

/**
 * One record's audience in one pool (Audience, 0033). On: placed on the pool
 * lane picked — any lane of a pool I am in, my record only (the database
 * holds both); with none picked, where it was. Off: kept, switched off, so
 * off stays distinct from never and nothing a pool wrote is orphaned.
 */
export async function setPlacement(
  splashId: string,
  poolId: string,
  shared: boolean,
  poolLaneId: string | null = null,
): Promise<Done> {
  pushAfter();
  const parsed = z
    .object({
      splashId: z.uuid(),
      poolId: z.uuid(),
      shared: z.boolean(),
      poolLaneId: z.uuid().nullable(),
    })
    .safeParse({ splashId, poolId, shared, poolLaneId });
  if (!parsed.success) return { ok: false, message: 'That didn’t save. Try again.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to change this.' };

  const { data: existing } = await supabase
    .from('splash_placements')
    .select('pool_lane_id')
    .eq('splash_id', splashId)
    .eq('pool_id', poolId)
    .maybeSingle();
  const lane = poolLaneId ?? existing?.pool_lane_id ?? null;
  if (shared && !lane) return { ok: false, message: 'Pick where it goes in that Pool.' };

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

/**
 * With, for my record in one pool (0035): Everyone, or the faces picked —
 * the picks as given, so people may be taken off; one who already wrote
 * keeps their side.
 */
export async function setPlacementTogether(
  splashId: string,
  poolId: string,
  picked: string[],
  everyone: boolean,
): Promise<Done> {
  pushAfter();
  const parsed = z
    .object({ splashId: z.uuid(), poolId: z.uuid(), picked: z.array(z.uuid()).max(64) })
    .safeParse({ splashId, poolId, picked });
  if (!parsed.success) return { ok: false, message: 'Some of those people aren’t in this Pool.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_placement_together', {
    p_splash: splashId,
    p_pool: poolId,
    p_users: picked,
    p_everyone: everyone,
  });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  revalidatePath(`/splash/${splashId}`);
  return { ok: true };
}

/** A new record's audience, written right after the record (compose). */
export async function placeNewSplash(
  splashId: string,
  picks: {
    poolId: string;
    poolLaneId: string;
    together?: { everyone: boolean; picked: string[] };
  }[],
): Promise<Done> {
  for (const pick of picks) {
    const done = await setPlacement(splashId, pick.poolId, true, pick.poolLaneId);
    if (!done.ok) return done;
    const t = pick.together;
    if (t && (t.everyone || t.picked.length > 0)) {
      const withDone = await setPlacementTogether(splashId, pick.poolId, t.picked, t.everyone);
      if (!withDone.ok) return withDone;
    }
  }
  return { ok: true };
}

/** Together (0033): any current member adds members to a joint record, or Everyone. */
export async function addJointInvitees(
  poolId: string,
  splashId: string,
  users: string[],
  everyone = false,
): Promise<Done> {
  pushAfter();
  const parsed = z
    .object({ splashId: z.uuid(), users: z.array(z.uuid()).max(64) })
    .safeParse({ splashId, users });
  if (!parsed.success) return { ok: false, message: 'Some of those people aren’t in this Pool.' };
  if (users.length === 0 && !everyone) return { ok: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_joint_invitees', {
    p_splash: splashId,
    p_users: users,
    p_everyone: everyone,
  });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
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
  /** Together (0033): the members picked; I am invited by the database. */
  invitees: z.array(z.uuid()).max(64).default([]),
  /** Everyone (0033): every current member, later joiners too. */
  everyone: z.boolean().default(false),
});

/**
 * A joint record (Together, 0033), opened by a member on a pool lane with
 * the members picked as its "Add your side" slots, and my first ripple.
 */
export async function createJointSplash(input: z.input<typeof Joint>): Promise<Made> {
  return reported('compose', () => createJointSplashWork(input));
}

async function createJointSplashWork(input: z.input<typeof Joint>): Promise<Made> {
  pushAfter();
  const parsed = Joint.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That joint splash is incomplete.' };
  const joint = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to drop this.' };

  // Everyone said explicitly (0033): the column's default is the old app's.
  const { error } = await supabase.rpc('create_together_splash', {
    p_id: joint.id,
    p_pool: joint.poolId,
    p_pool_lane: joint.poolLaneId,
    p_title: joint.title,
    p_icon: joint.icon ?? '',
    p_declared_start: joint.declaredStart,
    p_invite_all: joint.everyone,
  });
  if (error) return { ok: false, message: said(error) };
  const ended = await endRange(supabase, joint.id, joint.declaredEnd);
  if (ended) {
    await supabase.rpc('delete_joint_splash', { p_splash: joint.id });
    return { ok: false, message: ended };
  }
  const others = joint.invitees.filter((id) => id !== user.id);
  if (others.length > 0) {
    const { error: inviteError } = await supabase.rpc('add_joint_invitees', {
      p_splash: joint.id,
      p_users: others,
    });
    if (inviteError) {
      await supabase.rpc('delete_joint_splash', { p_splash: joint.id });
      return { ok: false, message: said(inviteError) };
    }
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
  if (!z.uuid().safeParse(splashId).success) return { ok: false, message: 'That splash is gone.' };
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
 * My pool record (0033; once "Just mine", 0014): my record written in a pool,
 * on one of its lanes, with no lane of mine — the default from a pool.
 * The splash and its one placement are made together by the database
 * (`create_own_pool_splash`); the first ripple follows with no lane. A
 * ripple that will not land takes the splash back with it.
 */
export async function dropOwnPoolSplash(input: z.infer<typeof OwnDrop>): Promise<Made> {
  return reported('compose', () => dropOwnPoolSplashWork(input));
}

async function dropOwnPoolSplashWork(input: z.infer<typeof OwnDrop>): Promise<Made> {
  pushAfter();
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
 * with it: pool records move into a new lane of their author's, each
 * author's joint ripples become one post of theirs (in the lane they filed
 * it in, 0060), shared records stay.
 */
export async function deletePool(poolId: string): Promise<Done> {
  if (!z.uuid().safeParse(poolId).success) return { ok: false, message: 'That Pool is gone.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_pool', { p_pool: poolId });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

const PoolPerson = z.object({ poolId: z.uuid(), userId: z.uuid() });

/** "Make someone else the owner" (0063): at once; they get an in-app notification. */
export async function transferPoolOwner(poolId: string, userId: string): Promise<Done> {
  if (!PoolPerson.safeParse({ poolId, userId }).success) {
    return { ok: false, message: 'Pick someone who is in this Pool.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('transfer_pool_owner', { p_pool: poolId, p_to: userId });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** "Remove from Pool" (0063): leaving with Remove, for them; no link lets them back. */
export async function removePoolMember(poolId: string, userId: string): Promise<Done> {
  if (!PoolPerson.safeParse({ poolId, userId }).success) {
    return { ok: false, message: 'They aren’t in this Pool.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_pool_member', { p_pool: poolId, p_user: userId });
  if (error) return { ok: false, message: said(error) };
  revalidatePool(poolId);
  return { ok: true };
}

/** "Allow back" (0063): the owner lets a removed person join again with a link. */
export async function allowBackPoolMember(poolId: string, userId: string): Promise<Done> {
  if (!PoolPerson.safeParse({ poolId, userId }).success)
    return { ok: false, message: 'That didn’t save. Try again.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('pool_removed_members')
    .delete()
    .eq('pool_id', poolId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) return { ok: false, message: said(error) };
  if (!data?.length) return { ok: false, message: 'Only the Pool’s owner can do that.' };
  revalidatePool(poolId);
  return { ok: true };
}

/**
 * Move to Home (H45): my record written in a pool becomes a record of my
 * lane (move_to_home, 0060). Every placement stays as it is, its origin's
 * included; from then on that pool's switch is unlocked like any other.
 */
export async function moveToHome(splashId: string, laneId: string): Promise<Done> {
  const ids = z.object({ splashId: z.uuid(), laneId: z.uuid() }).safeParse({ splashId, laneId });
  if (!ids.success) return { ok: false, message: 'That didn’t save. Try again.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('move_to_home', {
    p_splash: splashId,
    p_my_lane: laneId,
  });
  if (error) return { ok: false, message: said(error) };
  revalidatePool();
  revalidatePath(`/splash/${splashId}`);
  return { ok: true };
}
