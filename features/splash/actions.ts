'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { removeRippleMedia } from '@/lib/media';
import { MediaMetaInput, mediaMetaFor } from '@/lib/ripple-media';
import { createClient } from '@/lib/supabase/server';
import { reported } from '@/lib/report-failure';

import {
  Header,
  ISO_DATE,
  refuseRange,
  revalidateSplash,
  saveHeader,
  type SplashResult,
} from './header';

export type { Header, SplashResult } from './header';
export type Done = { ok: true } | { ok: false; message: string };

const Drop = Header.extend({
  /** The post's id, minted in the browser so the pill on the ground is the real one from the start. */
  id: z.uuid().optional(),
  /** The first block's body; empty makes a titled post with nothing in it yet. */
  body: z.string().trim().max(8000),
  media: z.array(z.string()).max(8),
  /** Each photo's size (0070), so a layout reserves its space. */
  mediaMeta: MediaMetaInput,
  /** Today in the author's zone: the post's date when none is given (H24). */
  today: z.string().regex(ISO_DATE),
  /** The first block's own day, when the post has a range (0031). */
  blockDay: z.string().regex(ISO_DATE).nullable().optional(),
  /** The custom shelf to sit on, if any (H21e). */
  sessionId: z.uuid().nullable(),
});

export type Drop = z.infer<typeof Drop>;

/**
 * The post sheet's one commit (SPEC 6): a post and, with it, its first block.
 * A line with no title is an untitled post whose line is its block; a title
 * with nothing under it is a post with nothing in it yet; both are complete.
 * The post carries the lane and the date (H24): no date given is today, no
 * lane given is the residual one; the block carries neither.
 */
export async function dropSplash(input: Drop): Promise<SplashResult> {
  return reported('compose', () => dropSplashWork(input));
}

async function dropSplashWork(input: Drop): Promise<SplashResult> {
  const parsed = Drop.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'That post is incomplete.' };
  const drop = parsed.data;
  const refused = refuseRange(drop);
  if (refused) return { ok: false, message: refused };
  if (!drop.title && !drop.body && drop.media.length === 0 && !drop.declaredLaneId) {
    return { ok: false, message: 'Nothing to drop.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to drop this.' };

  const laneId = drop.declaredLaneId ?? (await residualLane(supabase));
  if (!laneId) return { ok: false, message: 'There is no lane to drop into.' };

  const { data: splash, error } = await supabase
    .from('splashes')
    .insert({
      ...(drop.id ? { id: drop.id } : {}),
      owner_id: user.id,
      title: drop.title,
      declared_start: drop.declaredStart ?? drop.today,
      declared_end: drop.declaredStart ? drop.declaredEnd : null,
      declared_lane_id: laneId,
      icon: drop.icon || null,
      session_id: drop.sessionId,
    })
    .select('*')
    .single();
  if (error) return { ok: false, message: error.message };

  const hasBlock = drop.body.length > 0 || drop.media.length > 0;
  if (hasBlock) {
    const { error: blockError } = await supabase.from('ripples').insert({
      author_id: user.id,
      note: drop.body.length > 0 ? drop.body : null,
      media: drop.media,
      media_meta: mediaMetaFor(drop.media, drop.mediaMeta ?? {}),
      splash_id: splash.id,
      // Its own day inside the post's range (0031); the database checks it.
      ...(drop.blockDay && drop.declaredEnd ? { occurred_on: drop.blockDay } : {}),
    });
    if (blockError) {
      // A post without the words that made it is not what was dropped.
      await supabase.from('splashes').delete().eq('id', splash.id);
      return { ok: false, message: blockError.message };
    }
  }

  revalidateSplash(splash.id);
  return { ok: true, splash };
}

/** Day, if the account still has it; else the first lane (H20i). */
async function residualLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase.from('my_categories').select('id, name').order('position');
  return (data ?? []).find((c) => c.name === 'Day')?.id ?? data?.[0]?.id ?? null;
}

/**
 * Edits a post's header in place: title, range, lane. RLS makes it mine;
 * the update touches no block, and every block follows at once (H24): a
 * block's lane and date are its post's.
 */
/**
 * A splash's description (0037): set, changed, or taken off (empty is none).
 * My own splash, or a joint one by any current member — RLS holds that, as
 * for its title.
 */
export async function setSplashDescription(id: string, text: string): Promise<Done> {
  return reported('edit', () => setSplashDescriptionWork(id, text));
}

async function setSplashDescriptionWork(id: string, text: string): Promise<Done> {
  const parsed = z
    .object({ id: z.uuid(), text: z.string().trim().max(2000) })
    .safeParse({ id, text });
  if (!parsed.success) return { ok: false, message: 'A description is up to 2,000 characters.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('splashes')
    .update({ description: parsed.data.text || null })
    .eq('id', parsed.data.id)
    .select('id');
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: 'That splash is not yours to describe.' };
  revalidatePath('/');
  revalidatePath(`/splash/${id}`);
  return { ok: true };
}

export async function updateSplashHeader(id: string, input: Header): Promise<SplashResult> {
  return reported('edit', () => saveHeader(id, input));
}

/** Pins or unpins a post (H21g). */
export async function setSplashPinned(id: string, pinned: boolean): Promise<Done> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('splashes')
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return { ok: false, message: error.message };
  revalidateSplash(id);
  return { ok: true };
}

/**
 * Deletes a post **and its blocks** (H21, the reversal of H20d): the FK
 * cascades, and the media is gathered first because afterwards nothing says
 * which objects were theirs (H17). Hard, with no undo.
 */
export async function deleteSplash(id: string): Promise<Done> {
  const supabase = await createClient();

  const { data: blocks } = await supabase.from('ripples').select('media').eq('splash_id', id);
  const paths = (blocks ?? []).flatMap((row) => row.media);

  const { error } = await supabase.from('splashes').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };

  await removeRippleMedia(paths);
  revalidateSplash();
  return { ok: true };
}
