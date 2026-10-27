'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { laneRule, resolveCategory } from '@/features/input-sheet/draft';
import { createClient } from '@/lib/supabase/server';

/**
 * What the sheet can tell the author when a write is refused. The collision
 * and straddle members are dormant with the exclusion constraint and the
 * Timer (H20b, H20c); the notices that render them stay for P3's Swim.
 */
export type CommitResult =
  | { ok: true; rippleId: string }
  | { ok: false; reason: 'collision'; withNote: string | null; withId: string; canNest: boolean }
  | { ok: false; reason: 'straddles' }
  | { ok: false; reason: 'error'; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

const Draft = z.object({
  /** Minted in the browser, so the block shown at once is the real one (CLAUDE.md, the principle). */
  id: z.uuid().optional(),
  /** Null = no lane chosen: the residual lane takes it (H20i). */
  categoryId: z.uuid().nullable(),
  note: z.string().trim().max(2000).optional(),
  media: z.array(z.string()).max(8),
  /** The annotation (H20c), or nothing: a plain posted fragment. */
  occurredOn: z.string().regex(ISO_DATE).nullable(),
  occurredTime: z.string().regex(CLOCK).nullable(),
  /** The instants the wall clock refers to, resolved in the browser. */
  startInstant: z.iso.datetime().nullable(),
  endInstant: z.iso.datetime().nullable(),
  splashId: z.uuid().nullable(),
});

export type Draft = z.infer<typeof Draft>;

/**
 * Writes one block (H21a): into a post when `splashId` is set, else as a
 * splashless block that renders as an untitled post of one.
 */
export async function commitRipple(input: Draft): Promise<CommitResult> {
  const parsed = Draft.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'error', message: 'That draft is incomplete.' };
  const draft = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'error', message: 'Sign in again to record this.' };

  const refusal = checkAnnotation(draft);
  if (refusal) return refusal;

  const lane = await categoryFor(supabase, draft.categoryId, draft.splashId);
  // A block on a Just-mine splash has no lane of mine (0014); any other needs one.
  const categoryId = lane === 'none' ? null : lane;
  if (lane === null) {
    return { ok: false, reason: 'error', message: 'There is no lane to drop into.' };
  }

  // A point ends where it starts; a span ends where it says — with a clock,
  // or by dates alone; an unannotated fragment has no instant at all (H20c).
  const endedAt = draft.endInstant ?? draft.startInstant;

  const { data, error } = await supabase
    .from('ripples')
    .insert({
      ...(draft.id ? { id: draft.id } : {}),
      author_id: user.id,
      category_id: categoryId,
      note: draft.note?.length ? draft.note : null,
      media: draft.media,
      occurred_on: draft.occurredOn,
      occurred_time: draft.occurredTime,
      ended_at: endedAt,
      splash_id: draft.splashId,
    })
    .select('id')
    .single();

  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  if (draft.splashId) revalidatePath(`/splash/${draft.splashId}`);
  return { ok: true, rippleId: data.id };
}

/**
 * The lane a block lands in, with the post's default applied on the server
 * as well as in the editor (H21f): a choice wins; no choice takes the post's
 * declared lane; no declaration falls into the residual lane.
 */
async function categoryFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  chosen: string | null,
  splashId: string | null,
): Promise<string | 'none' | null> {
  const [{ data: categories }, { data: splash }] = await Promise.all([
    supabase.from('my_categories').select('*').order('position'),
    splashId
      ? supabase
          .from('splashes')
          .select('declared_lane_id, own_pool_id, owner_id, pool_id, pool_lane_id')
          .eq('id', splashId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // My pool record (0014, 0033): no lane of mine, and no Day to fall into.
  if (splash?.own_pool_id) return 'none';
  // A joint splash (0016, 0033): my home lane for its pool lane, else none
  // — never a lane I happened to pick.
  if (splash && splash.owner_id === null && splash.pool_lane_id) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: link } = await supabase
      .from('lane_mappings')
      .select('my_category_id')
      .eq('user_id', user?.id ?? '')
      .eq('pool_lane_id', splash.pool_lane_id)
      .eq('is_home', true)
      .maybeSingle();
    return link ? link.my_category_id : 'none';
  }

  const rule = laneRule(splash ? { declaredLaneId: splash.declared_lane_id } : null);
  return resolveCategory(chosen, rule, categories ?? []);
}

/**
 * The one thing an annotation can get wrong (H20c): an end before its start.
 * A time needs a date, and an end needs a time — the shape, not a policy.
 */
function checkAnnotation(draft: Draft): Extract<CommitResult, { ok: false }> | null {
  if (draft.occurredTime !== null && draft.occurredOn === null) {
    return { ok: false, reason: 'error', message: 'A time needs a date.' };
  }
  // An end needs a beginning: a clock to follow, or by dates alone a date
  // (the row's own rule, ripples_ended_needs_date).
  if (draft.endInstant !== null) {
    if (draft.occurredOn === null) {
      return { ok: false, reason: 'error', message: 'An end needs a start.' };
    }
    if (
      draft.startInstant !== null &&
      Date.parse(draft.endInstant) <= Date.parse(draft.startInstant)
    ) {
      return { ok: false, reason: 'error', message: 'That end is before the start.' };
    }
  }
  return null;
}

/**
 * Stops a running timer. Dormant (H20b): no surface starts one any more, and
 * the focus screen that calls this waits for P3's Swim.
 */
export async function stopSession(rippleId: string): Promise<CommitResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('ripples')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', rippleId)
    .is('ended_at', null);

  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  return { ok: true, rippleId };
}
