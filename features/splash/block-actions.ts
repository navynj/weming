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
  /**
   * Its own day, on a range splash only (0031): inside the range, checked
   * again by the database. Absent: the day is not this edit's to touch.
   */
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/** The database's refusals, said plainly. */
function said(message: string): string {
  return /outside this splash's range/.test(message)
    ? 'That day is outside this splash’s range.'
    : /has no range/.test(message)
      ? 'This splash has no range to date an entry in.'
      : message;
}

const NewBlock = Block.extend({
  splashId: z.uuid(),
  /** My side on someone's record, in the pool I write it in (0035). */
  threadPoolId: z.uuid().nullable().optional(),
});

/**
 * Writes a block onto its post (H24): its words, its photos, its post. Its
 * lane is the post's, always; on a post with a range it may carry its own
 * day inside it (0031), and nowhere else — the database refuses one that
 * tries (0029, 0031).
 */
export async function addBlock(input: z.input<typeof NewBlock>): Promise<CommitResult> {
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
    ...(block.threadPoolId ? { thread_pool_id: block.threadPoolId } : {}),
    ...(block.occurredOn ? { occurred_on: block.occurredOn } : {}),
  });
  if (error) return { ok: false, reason: 'error', message: said(error.message) };

  revalidatePath('/');
  revalidatePath(`/splash/${block.splashId}`);
  return { ok: true, rippleId: block.id };
}

/**
 * Corrects a block's words and photos in place (H17), and on a range post
 * its day (0031). Its lane is not its own to edit (H24); elsewhere an older
 * block's date is kept as written, read back, never sent again.
 */
export async function editBlock(input: z.infer<typeof Block>): Promise<CommitResult> {
  const parsed = Block.safeParse(input);
  if (!parsed.success) return { ok: false, reason: 'error', message: 'That edit is incomplete.' };
  const block = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ripples')
    .update({
      note: block.note.length > 0 ? block.note : null,
      media: block.media,
      ...(block.occurredOn ? { occurred_on: block.occurredOn } : {}),
    })
    .eq('id', block.id)
    .select('splash_id')
    .maybeSingle();
  if (error) return { ok: false, reason: 'error', message: said(error.message) };
  if (!data) return { ok: false, reason: 'error', message: 'That record is gone.' };

  revalidatePath('/');
  if (data.splash_id) revalidatePath(`/splash/${data.splash_id}`);
  return { ok: true, rippleId: block.id };
}
