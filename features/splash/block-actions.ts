'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { CommitResult } from '@/features/input-sheet/commit';
import { createClient } from '@/lib/supabase/server';

const Block = z.object({
  /** Minted in the browser, so the block shown at once is the real one (CLAUDE.md, the principle). */
  id: z.uuid(),
  note: z.string().trim().max(2000),
  media: z.array(z.string()).max(8),
});

const NewBlock = Block.extend({ splashId: z.uuid() });

/**
 * Writes a block onto its post (H24): its words, its photos, its post —
 * nothing else. Its lane and date are the post's; a block carries none of
 * its own, and the database refuses one that tries (0029).
 */
export async function addBlock(input: z.infer<typeof NewBlock>): Promise<CommitResult> {
  const parsed = NewBlock.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'error', message: 'That block is incomplete.' };
  const block = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'error', message: 'Sign in again to record this.' };

  const { error } = await supabase.from('ripples').insert({
    id: block.id,
    author_id: user.id,
    note: block.note.length > 0 ? block.note : null,
    media: block.media,
    splash_id: block.splashId,
  });
  if (error) return { ok: false, reason: 'error', message: error.message };

  revalidatePath('/');
  revalidatePath(`/splash/${block.splashId}`);
  return { ok: true, rippleId: block.id };
}

/**
 * Corrects a block's words and photos in place (H17). Its lane and date are
 * not its own to edit (H24): an older block's are kept as written, read
 * back, never sent again.
 */
export async function editBlock(input: z.infer<typeof Block>): Promise<CommitResult> {
  const parsed = Block.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'error', message: 'That edit is incomplete.' };
  const block = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ripples')
    .update({ note: block.note.length > 0 ? block.note : null, media: block.media })
    .eq('id', block.id)
    .select('splash_id')
    .maybeSingle();
  if (error) return { ok: false, reason: 'error', message: error.message };
  if (!data) return { ok: false, reason: 'error', message: 'That record is gone.' };

  revalidatePath('/');
  if (data.splash_id) revalidatePath(`/splash/${data.splash_id}`);
  return { ok: true, rippleId: block.id };
}
