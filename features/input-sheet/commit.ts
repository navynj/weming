'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { reported } from '@/lib/report-failure';
import { MediaMetaInput, mediaMetaFor } from '@/lib/ripple-media';

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
  /** Each new photo's size (0070), so a layout reserves its space. */
  mediaMeta: MediaMetaInput,
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
  return reported('compose', () => commitRippleWork(input));
}

async function commitRippleWork(input: Draft): Promise<CommitResult> {
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

  // A point ends where it starts; a span ends where it says — with a clock,
  // or by dates alone; an unannotated fragment has no instant at all (H20c).
  const endedAt = draft.endInstant ?? draft.startInstant;

  const { data, error } = await supabase
    .from('ripples')
    .insert({
      ...(draft.id ? { id: draft.id } : {}),
      author_id: user.id,
      note: draft.note?.length ? draft.note : null,
      media: draft.media,
      media_meta: mediaMetaFor(draft.media, draft.mediaMeta ?? {}),
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
