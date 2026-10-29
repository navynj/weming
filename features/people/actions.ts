'use server';

import { refresh, revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AVATAR_BUCKET, avatarPath } from '@/lib/avatar-bucket';
import { storage, type SignedUpload } from '@/lib/storage';
import { createClient } from '@/lib/supabase/server';
import { THEME_COLORS, THEME_MODES, type ThemeColor, type ThemeMode } from '@/lib/theme';

import { displayName } from './name';

const input = z.object({
  name: displayName,
  /** `uploaded`: the browser has just written my file; the version moves so the URL does. */
  photo: z.enum(['keep', 'uploaded', 'remove']),
});

export type ProfileSave = z.input<typeof input>;
export type ProfileSaved = { ok: true } | { ok: false; message: string };

/**
 * Where my new photo's bytes go (0018, 2026-10-28): a signed PUT for my own
 * path, which is my id and nothing the browser names. Replaces what is
 * there; the version `saveProfile` moves is what makes the URL new.
 */
export async function requestAvatarUpload(
  contentType: string,
): Promise<{ ok: true; upload: SignedUpload } | { ok: false; message: string }> {
  if (!z.enum(['image/webp', 'image/jpeg', 'image/png']).safeParse(contentType).success) {
    return { ok: false, message: 'That photo’s type isn’t one we keep.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to save your profile.' };
  try {
    const upload = await storage().signedUploadUrl(AVATAR_BUCKET, avatarPath(user.id), {
      contentType,
      cacheControl: 86400,
      upsert: true,
    });
    return { ok: true, upload };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

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
    try {
      await storage().remove(AVATAR_BUCKET, [avatarPath(user.id)]);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
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
  // A name and a face show on every page, which no one path names: the page
  // I am on comes back in this response, the one render of this write.
  refresh();
  return { ok: true };
}

const themeInput = z.object({
  home: z.enum(THEME_COLORS as [ThemeColor, ...ThemeColor[]]),
  mode: z.enum(['dark', 'light', 'pastel']),
  /** My Home colour over every pool's, unless I chose one there (0059). */
  everywhere: z.boolean(),
});

/**
 * Saves my theme (0059): my Home colour, my mode and whether it applies in
 * every pool, in settings nobody else reads. Written to my profile too
 * (0032) until the app that reads only the settings has replaced the one
 * that read the profile; a later contract drops those columns.
 */
export async function saveTheme(raw: z.input<typeof themeInput>): Promise<ProfileSaved> {
  const parsed = themeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'That theme is not one of the twelve.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to save your theme.' };
  const { home, mode, everywhere } = parsed.data;
  const [settings, profile] = await Promise.all([
    supabase
      .from('my_theme_settings')
      .upsert({ user_id: user.id, home_color: home, mode, apply_everywhere: everywhere }),
    supabase.from('profiles').update({ theme_color: home, theme_mode: mode }).eq('id', user.id),
  ]);
  const error = settings.error ?? profile.error;
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

const poolColor = z.enum(THEME_COLORS as [ThemeColor, ...ThemeColor[]]).nullable();
const poolMode = z.enum(THEME_MODES as [ThemeMode, ...ThemeMode[]]).nullable();
const poolTheme = z.object({ poolId: z.uuid(), color: poolColor, mode: poolMode });

/** A pool's colour and its mode (0059, 0062): any current member sets or clears them. */
export async function setPoolTheme(
  poolId: string,
  color: ThemeColor | null,
  mode: ThemeMode | null,
): Promise<ProfileSaved> {
  const parsed = poolTheme.safeParse({ poolId, color, mode });
  if (!parsed.success) return { ok: false, message: 'That colour is not one of the twelve.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pool_theme', {
    p_pool: parsed.data.poolId,
    p_theme: parsed.data.color as string,
    p_mode: parsed.data.mode as string,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === '42501' ? 'Only someone in this Pool can change its colour.' : error.message,
    };
  }
  revalidatePath(`/pool/${parsed.data.poolId}`);
  return { ok: true };
}

/** My colour in one pool and its mode (0059, 0062), over every other for me there; null uses the pool's. */
export async function setMyPoolTheme(
  poolId: string,
  color: ThemeColor | null,
  mode: ThemeMode | null,
): Promise<ProfileSaved> {
  const parsed = poolTheme.safeParse({ poolId, color, mode });
  if (!parsed.success) return { ok: false, message: 'That colour is not one of the twelve.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in again to save your colour.' };
  const { error } = await supabase.from('member_pool_settings').upsert({
    pool_id: parsed.data.poolId,
    user_id: user.id,
    theme: parsed.data.color,
    // Cleared, the colour takes its mode with it.
    theme_mode: parsed.data.color ? parsed.data.mode : null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
