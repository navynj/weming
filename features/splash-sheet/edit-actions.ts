'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { Annotation } from '@/features/input-sheet/draft';
import { setPlacement, setPlacementTogether } from '@/features/pool/actions';
import { getJointInvitees, getPlacementPicks } from '@/lib/queries/pools';
import { updateSplashHeader } from '@/features/splash/actions';
import { createClient } from '@/lib/supabase/server';
import { reported } from '@/lib/report-failure';

/** What the edit sheet opens with, read fresh so the Audience is exact wherever it opened. */
export type SplashEditState =
  | {
      ok: true;
      /** mine: everything; own: my pool record (title, icon, dates; its pool fixed); joint: title and icon. */
      kind: 'mine' | 'own' | 'joint';
      title: string;
      icon: string | null;
      /** Its description (0037), or null. */
      description: string | null;
      declaredStart: string | null;
      declaredEnd: string | null;
      declaredLaneId: string | null;
      /** Pools my splash is shared to now (mine only). */
      shared: string[];
      /** The pool a Just-mine or joint splash lives in. */
      poolId: string | null;
      /** The splash's own range (H24), as the composer's control shows it. */
      annotation: Annotation | null;
      /** A pool's own splash (joint, Just mine): its pool's lanes, and the one it is in (0020). */
      poolLanes: { id: string; name: string; icon: string | null }[];
      poolLaneId: string | null;
      /** Mine: each pool it is shared to now, on which pool lane (0022), and with whom (0035). */
      sharedIn: {
        poolId: string;
        poolLaneId: string;
        together: { everyone: boolean; picked: string[] };
      }[];
      /** My pool record: who it is with in its pool (0035). */
      ownTogether: { everyone: boolean; picked: string[] } | null;
      /** Someone else has a ripple here I can see: it cannot become mine (0022). */
      othersWrote: boolean;
      /** A joint record: who it is together with, picked one by one (0033). */
      invitees: string[];
      /** A joint record: together with everyone (0033). */
      inviteAll: boolean;
      /** A joint record: I made it, so I may take people off its With (0043). */
      isMaker: boolean;
      /** Who has a ripple on it, for "has written here" when taken off (0043). */
      writerIds: string[];
      /** Every pool lane of my pools, for the sheet's warnings: "It will move to <lane>". */
      laneNames: Record<string, { name: string; icon: string | null; poolId: string }>;
    }
  | { ok: false; message: string };

/**
 * Everything the sheet opens with, read in one round of parallel requests
 * (review: "Opening…" waited on five in a row). RLS decides what each one
 * returns; nothing here depends on another answer but the split at the end.
 */
export async function loadSplashEdit(id: string): Promise<SplashEditState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'No such splash.' };
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: splash },
    { data: placements },
    { data: writers },
    invited,
    { data: allLanes },
    picks,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('splashes')
      .select(
        'owner_id, pool_id, pool_lane_id, own_pool_id, title, icon, description, declared_start, declared_end, declared_lane_id, joint_invite_all, created_by',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('splash_placements')
      .select('pool_id, pool_lane_id, shared, invite_all')
      .eq('splash_id', id),
    supabase.from('ripples').select('author_id').eq('splash_id', id),
    getJointInvitees(supabase, [id]),
    // RLS: the lanes of pools I am a current member of.
    supabase.from('pool_lanes').select('id, name, icon, pool_id, position').order('position'),
    getPlacementPicks(supabase, id),
  ]);
  if (!user) return { ok: false, message: 'Sign in again to edit this.' };
  if (!splash) return { ok: false, message: 'That splash is gone.' };

  const joint = splash.owner_id === null;
  if (!joint && splash.owner_id !== user.id) {
    return { ok: false, message: 'Only its author edits this splash.' };
  }
  const ownPool = splash.pool_id ?? splash.own_pool_id;
  const placed = (placements ?? []).find((p) => p.pool_id === splash.own_pool_id);
  // The splash's own days (H24): its ripples take them and carry none.
  const annotation: Annotation | null = splash.declared_start
    ? { date: splash.declared_start, time: null, endDate: splash.declared_end, endTime: null }
    : null;
  // Mine: each pool it is shared to now. A pool's own has none to list.
  const sharedIn =
    !joint && !splash.own_pool_id
      ? (placements ?? [])
          .filter((p) => p.shared)
          .map((p) => ({
            poolId: p.pool_id,
            poolLaneId: p.pool_lane_id,
            together: { everyone: p.invite_all, picked: picks[p.pool_id] ?? [] },
          }))
      : [];
  return {
    ok: true,
    kind: joint ? 'joint' : splash.own_pool_id ? 'own' : 'mine',
    title: splash.title,
    icon: splash.icon,
    description: splash.description,
    declaredStart: splash.declared_start,
    declaredEnd: splash.declared_end,
    declaredLaneId: splash.declared_lane_id,
    shared: sharedIn.map((p) => p.poolId),
    poolId: ownPool,
    annotation,
    poolLanes: (allLanes ?? [])
      .filter((l) => ownPool && l.pool_id === ownPool)
      .map(({ id: laneId, name, icon }) => ({ id: laneId, name, icon })),
    poolLaneId: splash.pool_lane_id ?? placed?.pool_lane_id ?? null,
    sharedIn,
    ownTogether:
      splash.own_pool_id && placed
        ? { everyone: placed.invite_all, picked: picks[splash.own_pool_id] ?? [] }
        : null,
    othersWrote: (writers ?? []).some((w) => w.author_id !== user.id),
    invitees: joint ? (invited[id] ?? []) : [],
    inviteAll: splash.joint_invite_all,
    isMaker: joint && splash.created_by === user.id,
    writerIds: [...new Set((writers ?? []).map((w) => w.author_id))],
    laneNames: Object.fromEntries(
      (allLanes ?? []).map((l) => [l.id, { name: l.name, icon: l.icon, poolId: l.pool_id }]),
    ),
  };
}

const CONVERSION = z.discriminatedUnion('op', [
  z.object({ op: z.literal('none') }),
  z.object({ op: z.literal('move_pool'), poolLaneId: z.uuid() }),
  z.object({
    op: z.literal('to_joint'),
    poolLaneId: z.uuid(),
    invitees: z.array(z.uuid()).max(64),
    everyone: z.boolean(),
  }),
  z.object({ op: z.literal('to_mine'), myLaneId: z.uuid(), placeOn: z.uuid().nullable() }),
  z.object({
    op: z.literal('set_lane'),
    myLaneId: z.uuid().nullable(),
    placeOn: z.uuid().nullable(),
  }),
]);

/** One conversion act (0022, 0033), or a move within the pool (0020); null when done. */
async function convert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  plan: z.infer<typeof CONVERSION>,
): Promise<{ ok: false; message: string } | null> {
  if (plan.op === 'to_joint') {
    // Everyone said explicitly (0033): splash_to_joint is the old app's.
    const { error } = await supabase.rpc('splash_to_together', {
      p_splash: id,
      p_pool_lane: plan.poolLaneId,
      p_invite_all: plan.everyone,
    });
    if (error) return refused(error);
    if (plan.invitees.length === 0) return null;
    const { error: inviteError } = await supabase.rpc('add_joint_invitees', {
      p_splash: id,
      p_users: plan.invitees,
    });
    return inviteError ? refused(inviteError) : null;
  }
  const { error } =
    plan.op === 'none'
      ? { error: null }
      : plan.op === 'move_pool'
        ? await supabase.rpc('move_pool_splash', { p_splash: id, p_pool_lane: plan.poolLaneId })
        : plan.op === 'to_mine'
          ? await supabase.rpc('splash_to_mine', {
              p_splash: id,
              p_my_lane: plan.myLaneId,
              ...(plan.placeOn ? { p_place_on: plan.placeOn } : {}),
            })
          : await supabase.rpc('set_splash_lane', {
              p_splash: id,
              // Null keeps no lane; the generated type reads the argument as required.
              p_my_lane: plan.myLaneId as string,
              ...(plan.placeOn ? { p_place_on: plan.placeOn } : {}),
            });
  return error ? refused(error) : null;
}

function refused(error: { message: string }): { ok: false; message: string } {
  return {
    ok: false,
    message: /others have written here/.test(error.message)
      ? 'Others have written here.'
      : error.message,
  };
}

const Edit = z.object({
  id: z.uuid(),
  kind: z.enum(['mine', 'own', 'joint']),
  title: z.string().trim().max(120),
  icon: z.string().trim().max(16).nullable(),
  /** Its description (0037) when it changed; empty takes it off. Absent leaves it. */
  description: z.string().trim().max(2000).optional(),
  declaredStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  declaredEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  declaredLaneId: z.uuid().nullable(),
  /** Mine only: the pools that changed, each on a pool lane or off (0033), and With (0035). */
  share: z
    .array(
      z.object({
        poolId: z.uuid(),
        on: z.boolean(),
        poolLaneId: z.uuid().nullable(),
        together: z.object({ everyone: z.boolean(), picked: z.array(z.uuid()).max(64) }).optional(),
      }),
    )
    .max(24),
  /** My pool record: With in its pool, when it changed (0035). */
  ownTogether: z
    .object({ everyone: z.boolean(), picked: z.array(z.uuid()).max(64) })
    .nullable()
    .optional(),
  /** A joint record: members added in Together (0033), or Everyone turned on. */
  invite: z.array(z.uuid()).max(64).default([]),
  inviteEveryone: z.boolean().default(false),
  /** Its maker's whole With (0043): replaces the list, Everyone on or off. */
  jointTogether: z
    .object({ everyone: z.boolean(), picked: z.array(z.uuid()).max(64) })
    .nullable()
    .default(null),
  poolId: z.uuid().nullable(),
  /** A pool's own splash: the pool lane it moves to, when it moved (0020). */
  poolLaneId: z.uuid().nullable(),
  /** A change of kind or lane, decided by the sheet (0022); absent is none. */
  conversion: CONVERSION.optional(),
});

/**
 * Saves the edit sheet. Mine: the header as the page edits it, then each
 * pool switch that changed. Just mine: title, icon and dates; its lane stays
 * none and its pool stays its own (0014). Joint: title and icon, by any
 * current member — RLS holds that, and the rest of a joint splash is the
 * pool's (H23).
 */
export async function saveSplashEdit(
  input: z.input<typeof Edit>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return reported('edit', () => saveSplashEditWork(input));
}

async function saveSplashEditWork(
  input: z.input<typeof Edit>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = Edit.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That edit is incomplete.' };
  const edit = parsed.data;

  if (edit.kind === 'joint') {
    const supabase = await createClient();
    const { error } = await supabase
      .from('splashes')
      .update({
        title: edit.title,
        icon: edit.icon || null,
        ...(edit.description !== undefined ? { description: edit.description || null } : {}),
      })
      .eq('id', edit.id);
    if (error) return { ok: false, message: error.message };
    if (edit.jointTogether) {
      const { error: setError } = await supabase.rpc('set_joint_together', {
        p_splash: edit.id,
        p_users: edit.jointTogether.picked,
        p_everyone: edit.jointTogether.everyone,
      });
      if (setError) return refused(setError);
    } else if (edit.invite.length > 0 || edit.inviteEveryone) {
      const { error: inviteError } = await supabase.rpc('add_joint_invitees', {
        p_splash: edit.id,
        p_users: edit.invite,
        p_everyone: edit.inviteEveryone,
      });
      if (inviteError) return refused(inviteError);
    }
    const moved = edit.conversion
      ? await convert(supabase, edit.id, edit.conversion)
      : await movePoolSplash(supabase, edit.id, edit.poolLaneId);
    if (moved) return moved;
    // Made mine from Home: shared where its new Audience says.
    if (edit.conversion?.op === 'to_mine') {
      const shared = await applyShare(edit.id, edit.share);
      if (shared) return shared;
    }
    revalidatePath('/');
    if (edit.poolId) {
      revalidatePath(`/pool/${edit.poolId}`);
      revalidatePath(`/pool/${edit.poolId}/splash/${edit.id}`);
    }
    return { ok: true };
  }

  const header = await updateSplashHeader(edit.id, {
    title: edit.title,
    icon: edit.icon,
    declaredStart: edit.declaredStart,
    declaredEnd: edit.declaredEnd,
    // My pool record never takes a lane of mine.
    declaredLaneId: edit.kind === 'own' ? null : edit.declaredLaneId,
  });
  if (!header.ok) return header;
  const supabase = await createClient();
  if (edit.description !== undefined) {
    const { error: describeError } = await supabase
      .from('splashes')
      .update({ description: edit.description || null })
      .eq('id', edit.id);
    if (describeError) return { ok: false, message: describeError.message };
  }
  if (edit.conversion) {
    const converted = await convert(supabase, edit.id, edit.conversion);
    if (converted) return converted;
  } else if (edit.kind === 'own') {
    const moved = await movePoolSplash(supabase, edit.id, edit.poolLaneId);
    if (moved) return moved;
  }
  if (edit.kind === 'own' && edit.ownTogether && edit.poolId && edit.conversion?.op !== 'to_mine') {
    const withDone = await setPlacementTogether(
      edit.id,
      edit.poolId,
      edit.ownTogether.picked,
      edit.ownTogether.everyone,
    );
    if (!withDone.ok) return { ok: false, message: `Saved, but not with: ${withDone.message}` };
  }
  revalidatePath('/');
  revalidatePath(`/splash/${edit.id}`);
  if (edit.poolId) revalidatePath(`/pool/${edit.poolId}/splash/${edit.id}`);
  // Hand-made sharing applies to a record that is mine after the save — one
  // made mine from Home too, its Audience set anew; a conversion to joint
  // has already let go of every pool.
  const mineAfter =
    edit.kind === 'mine'
      ? !edit.conversion || ['none', 'set_lane'].includes(edit.conversion.op)
      : edit.conversion?.op === 'to_mine';
  if (mineAfter) {
    const shared = await applyShare(edit.id, edit.share);
    if (shared) return shared;
  }
  if (edit.poolId) revalidatePath(`/pool/${edit.poolId}`);
  return { ok: true };
}

/** Each pool the Audience changed, on its pool lane or off; null when done. */
async function applyShare(
  id: string,
  share: {
    poolId: string;
    on: boolean;
    poolLaneId: string | null;
    together?: { everyone: boolean; picked: string[] };
  }[],
): Promise<{ ok: false; message: string } | null> {
  for (const { poolId, on, poolLaneId, together } of share) {
    const done = await setPlacement(id, poolId, on, poolLaneId);
    if (!done.ok) return { ok: false, message: `Saved, but not shared: ${done.message}` };
    if (on && together) {
      const withDone = await setPlacementTogether(id, poolId, together.picked, together.everyone);
      if (!withDone.ok) return { ok: false, message: `Saved, but not with: ${withDone.message}` };
    }
  }
  return null;
}

/** Moves a pool's own splash to another of its pool's lanes (0020); null when done or unmoved. */
async function movePoolSplash(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  poolLaneId: string | null,
): Promise<{ ok: false; message: string } | null> {
  if (!poolLaneId) return null;
  const { error } = await supabase.rpc('move_pool_splash', {
    p_splash: id,
    p_pool_lane: poolLaneId,
  });
  return error ? { ok: false, message: error.message } : null;
}

export type MakeJointPreview =
  | { ok: true; poolName: string; poolLaneId: string; removed: string[] }
  | { ok: false; message: string };

/**
 * "Make it a joint record of <Pool>…" (the `…` menu, the only way my record
 * becomes joint; Yoonji, in the session): what the confirm says first —
 * the pool, the pool lane it lands on (where it sits there now), and the
 * other pools it leaves.
 */
export async function previewMakeJoint(
  splashId: string,
  poolId: string,
): Promise<MakeJointPreview> {
  const ids = z.object({ splashId: z.uuid(), poolId: z.uuid() }).safeParse({ splashId, poolId });
  if (!ids.success) return { ok: false, message: 'No such splash.' };
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: splash },
    { data: placements },
    { data: pools },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('splashes').select('owner_id, own_pool_id').eq('id', splashId).maybeSingle(),
    supabase
      .from('splash_placements')
      .select('pool_id, pool_lane_id, shared')
      .eq('splash_id', splashId),
    supabase.from('pools').select('id, name'),
  ]);
  if (!user || !splash || splash.owner_id !== user.id) {
    return { ok: false, message: 'Only its author makes it joint.' };
  }
  const here = (placements ?? []).find((p) => p.pool_id === poolId && p.shared);
  if (!here) return { ok: false, message: 'It is not in that Pool.' };
  const nameOf = (id: string) => pools?.find((p) => p.id === id)?.name ?? 'A pool you left';
  return {
    ok: true,
    poolName: nameOf(poolId),
    poolLaneId: here.pool_lane_id,
    removed: (placements ?? [])
      .filter((p) => p.shared && p.pool_id !== poolId)
      .map((p) => nameOf(p.pool_id)),
  };
}

/**
 * Makes my record the pool's joint record on the pool lane it sits on there.
 * Everyone starts as composing does: on where the pool invites everyone by
 * default, and in a pool of one.
 */
export async function makeJointRecord(
  splashId: string,
  poolId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const preview = await previewMakeJoint(splashId, poolId);
  if (!preview.ok) return preview;
  const supabase = await createClient();
  const [{ data: pool }, { count: members }] = await Promise.all([
    supabase.from('pools').select('invite_all_by_default').eq('id', poolId).maybeSingle(),
    supabase
      .from('pool_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('pool_id', poolId)
      .is('left_at', null),
  ]);
  const { error } = await supabase.rpc('splash_to_together', {
    p_splash: splashId,
    p_pool_lane: preview.poolLaneId,
    p_invite_all: Boolean(pool?.invite_all_by_default) || (members ?? 0) <= 1,
  });
  if (error) return refused(error);
  revalidatePath('/');
  revalidatePath(`/splash/${splashId}`);
  revalidatePath(`/pool/${poolId}`);
  revalidatePath(`/pool/${poolId}/splash/${splashId}`);
  return { ok: true };
}
