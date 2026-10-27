'use server';

import { z } from 'zod';

import { AVATAR_BUCKET, avatarPath } from '@/lib/avatar-bucket';
import { createClient } from '@/lib/supabase/server';
import { THEME_COLORS, type ThemeColor } from '@/lib/theme';

import { displayName } from './name';

const input = z.object({
  name: displayName,
  /** `uploaded`: the browser has just written my file; the version moves so the URL does. */
  photo: z.enum(['keep', 'uploaded', 'remove']),
});

export type ProfileSave = z.input<typeof input>;
export type ProfileSaved = { ok: true } | { ok: false; message: string };

/** Saves my name and photo state (0018). The photo's bytes went up from the browser first. */
export async function saveProfile(raw: ProfileSave): Promise<ProfileSaved> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, photo } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to save your profile.' };

  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('avatar_version')
    .eq('id', user.id)
    .single();
  if (readError) return { ok: false, message: readError.message };

  if (photo === 'remove') {
    // A hard delete, storage included (CLAUDE.md): the row stops naming it
    // and the bytes go with it.
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath(user.id)]);
    if (error) return { ok: false, message: error.message };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: name,
      ...(photo === 'uploaded'
        ? { avatar_path: avatarPath(user.id), avatar_version: (current.avatar_version ?? 0) + 1 }
        : photo === 'remove'
          ? { avatar_path: null, avatar_version: null }
          : {}),
    })
    .eq('id', user.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

const themeInput = z.object({
  color: z.enum(THEME_COLORS as [ThemeColor, ...ThemeColor[]]),
  mode: z.enum(['dark', 'light', 'pastel']),
});

/** Saves my theme (0032): one colour and a mode, on my profile alone. */
export async function saveTheme(raw: z.input<typeof themeInput>): Promise<ProfileSaved> {
  const parsed = themeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'That theme is not one of the eleven.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to save your theme.' };
  const { error } = await supabase
    .from('profiles')
    .update({ theme_color: parsed.data.color, theme_mode: parsed.data.mode })
    .eq('id', user.id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
