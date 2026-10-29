import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { isCutOff, UNCONFIRMED } from '@/lib/supabase/fetch';

import type { Splash } from './summary';

/**
 * A post's header write, shared by the post's page and the edit sheet. Not a
 * server action itself: each caller is one, and reports its own failure once
 * (lib/report-failure.ts), so the edit sheet calling this inside its save
 * does not send the same failure twice.
 */

export type SplashResult = { ok: true; splash: Splash } | { ok: false; message: string };

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every path a post touches. The post pages and the ground re-read. */
export function revalidateSplash(id: string | null = null): void {
  revalidatePath('/');
  revalidatePath('/locker');
  revalidatePath('/lanes');
  if (id) revalidatePath(`/splash/${id}`);
}

export const Header = z.object({
  title: z.string().trim().max(120),
  /** The post's range, which every block takes (H24). Null leaves it as it is. */
  declaredStart: z.string().regex(ISO_DATE).nullable(),
  declaredEnd: z.string().regex(ISO_DATE).nullable(),
  /** The post's lane, which every block takes (H24); none on joint and Just mine. */
  declaredLaneId: z.uuid().nullable(),
  /** The post's own icon, one glyph, else its lane's emoji stands for it (0008). */
  icon: z.string().trim().max(16).nullable(),
});

export type Header = z.infer<typeof Header>;

export function refuseRange(header: Pick<Header, 'declaredStart' | 'declaredEnd'>): string | null {
  if (header.declaredEnd && !header.declaredStart) return 'An end date needs a start date.';
  if (header.declaredEnd && header.declaredStart && header.declaredEnd < header.declaredStart) {
    return 'That end is before the start.';
  }
  return null;
}

export async function saveHeader(id: string, input: Header): Promise<SplashResult> {
  const parsed = Header.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That header is incomplete.' };
  const header = parsed.data;
  const refused = refuseRange(header);
  if (refused) return { ok: false, message: refused };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('splashes')
    .update({
      title: header.title,
      // A post always has a date (H24): none sent leaves its range as it is.
      ...(header.declaredStart
        ? { declared_start: header.declaredStart, declared_end: header.declaredEnd }
        : {}),
      declared_lane_id: header.declaredLaneId,
      icon: header.icon || null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (!isCutOff(error)) return { ok: false, message: error.message };
    // Cut off is not refused: the update may have landed after the request
    // gave up. Read the row back; if it holds the change, it saved.
    const landed = await headerLanded(supabase, id, header);
    if (!landed) return { ok: false, message: UNCONFIRMED };
    revalidateSplash(id);
    return { ok: true, splash: landed };
  }
  revalidateSplash(id);
  return { ok: true, splash: data };
}

/** The row, when it already holds this header; null when it does not or cannot be read. */
async function headerLanded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  header: Header,
): Promise<Splash | null> {
  const { data, error } = await supabase.from('splashes').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const holds =
    data.title === header.title &&
    (data.icon ?? null) === (header.icon || null) &&
    data.declared_lane_id === header.declaredLaneId &&
    (!header.declaredStart ||
      (data.declared_start === header.declaredStart && data.declared_end === header.declaredEnd));
  return holds ? data : null;
}
