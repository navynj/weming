'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import { BoardLayout, type BoardLayoutJson } from './board-layout';

export type LayoutResult = { ok: true; layout: BoardLayoutJson } | { ok: false; message: string };

// Any id Postgres holds: z.guid, not z.uuid's RFC variant check, which
// refuses the fixtures' hand-made ids.
const Id = z.guid();

const Write = z.object({
  splashId: Id,
  /** The pool's layout; null for my Home layout. */
  poolId: Id.nullable(),
  patch: BoardLayout,
  clear: z.array(z.string().min(1).max(600)).max(64),
});

function revalidate(poolId: string | null): void {
  revalidatePath('/');
  if (poolId) revalidatePath(`/pool/${poolId}`);
}

/**
 * Writes a splash's calendar layout (0025): the edited fields merged in,
 * field by field, the cleared ones taken out — the database's
 * set_board_layout, whose policies decide who may. Refusals come back in
 * words, so the panel can say why its change was taken back.
 */
export async function setBoardLayout(input: z.infer<typeof Write>): Promise<LayoutResult> {
  const parsed = Write.safeParse(input);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path[0];
    return {
      ok: false,
      message:
        where === 'patch' || where === 'clear'
          ? 'That layout is out of range.'
          : 'That splash is not known.',
    };
  }
  const { splashId, poolId, patch, clear } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_board_layout', {
    p_splash: splashId,
    p_pool: poolId as string,
    p_patch: patch as never,
    p_clear: clear,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === '42501'
          ? 'Only a current member of this Pool can change its layout.'
          : error.code === '23514'
            ? 'That layout is out of range.'
            : 'The layout could not be saved.',
    };
  }
  revalidate(poolId);
  const layout = BoardLayout.safeParse(data);
  return { ok: true, layout: layout.success ? layout.data : {} };
}

/** "Use pool layout": my Home layout for the splash is gone, so my Home draws the pool's again. */
export async function revertToPoolLayout(splashId: string): Promise<LayoutResult> {
  if (!Id.safeParse(splashId).success) {
    return { ok: false, message: 'That splash is not known.' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('board_layouts')
    .delete()
    .eq('splash_id', splashId)
    .eq('scope', 'home');
  if (error) return { ok: false, message: 'The Home layout could not be removed.' };
  revalidate(null);
  return { ok: true, layout: {} };
}
