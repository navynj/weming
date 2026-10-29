'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ActionOutcome } from '@/lib/use-optimistic-action';
import { isValue, NOTIFICATION_TYPES, type NotificationType } from '@/lib/notifications/model';
import {
  getNotifications,
  getNotificationSettings,
  getPoolNotificationPrefs,
  getUnreadCount,
  type NotificationItem,
  type NotificationSettings,
  type PoolNotificationPrefs,
} from '@/lib/queries/notifications';
import { createClient } from '@/lib/supabase/server';
import { getMyPoolNames } from '@/lib/queries/pools';
import { poolPath } from '@/lib/routes';

/**
 * Notifications (H32). The database decides who may change what (0052:
 * the creator for pool defaults, each member for their own); these shape
 * the input and say a refusal in words.
 */

function refused(message: string | undefined): ActionOutcome {
  return { ok: false, message: message ?? 'That could not be saved.' };
}

const Type = z.enum(NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]]);

/** The bell's sheet, read when it opens. */
export async function loadNotifications(): Promise<NotificationItem[]> {
  return getNotifications(await createClient());
}

export async function loadUnreadCount(): Promise<number> {
  return getUnreadCount(await createClient());
}

/** These read, or every one with null (Mark all read). */
export async function markNotificationsRead(ids: string[] | null): Promise<ActionOutcome> {
  const parsed = z.array(z.uuid()).max(200).nullable().safeParse(ids);
  if (!parsed.success) return refused('Those are not notifications.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_notifications_read', {
    p_ids: parsed.data ?? undefined,
  });
  return error ? refused(error.message) : { ok: true };
}

const Pref = z.object({ poolId: z.uuid(), type: Type, value: z.string().nullable() });

/** Mine in a pool; null is Use pool default. */
export async function setMyNotificationPref(input: z.input<typeof Pref>): Promise<ActionOutcome> {
  const parsed = Pref.safeParse(input);
  if (!parsed.success) return refused('That setting is not valid.');
  const { poolId, type, value } = parsed.data;
  if (value !== null && !isValue(type, value)) return refused('That setting is not valid.');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refused('Sign in again.');
  const { error } =
    value === null
      ? await supabase
          .from('member_notification_prefs')
          .delete()
          .match({ pool_id: poolId, user_id: user.id, type })
      : await supabase
          .from('member_notification_prefs')
          .upsert({ pool_id: poolId, user_id: user.id, type, value });
  if (error) return refused(error.code === '42501' ? 'You’re not in this Pool.' : error.message);
  revalidatePath(poolPath(poolId));
  return { ok: true };
}

/** The pool's default, by its creator; null goes back to the app's. */
export async function setPoolNotificationDefault(
  input: z.input<typeof Pref>,
): Promise<ActionOutcome> {
  const parsed = Pref.safeParse(input);
  if (!parsed.success) return refused('That setting is not valid.');
  const { poolId, type, value } = parsed.data;
  if (value !== null && !isValue(type, value)) return refused('That setting is not valid.');
  const supabase = await createClient();
  const { error } =
    value === null
      ? await supabase.from('pool_notification_defaults').delete().match({ pool_id: poolId, type })
      : await supabase.from('pool_notification_defaults').upsert({ pool_id: poolId, type, value });
  if (error) {
    return refused(
      error.code === '42501' ? 'Only the Pool’s creator sets its defaults.' : error.message,
    );
  }
  revalidatePath(poolPath(poolId));
  return { ok: true };
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { paused: false, showTitles: false };
  return getNotificationSettings(supabase, user.id);
}

const Settings = z.object({ paused: z.boolean(), showTitles: z.boolean() });

/** Pause all notifications, and Show titles in notifications. */
export async function setNotificationSettings(
  input: z.input<typeof Settings>,
): Promise<ActionOutcome> {
  const parsed = Settings.safeParse(input);
  if (!parsed.success) return refused('That setting is not valid.');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refused('Sign in again.');
  const { error } = await supabase.from('notification_settings').upsert({
    user_id: user.id,
    paused: parsed.data.paused,
    show_titles: parsed.data.showTitles,
    updated_at: new Date().toISOString(),
  });
  if (error) return refused(error.message);
  revalidatePath('/pool', 'layout');
  return { ok: true };
}

const Subscription = z.object({
  endpoint: z.url().startsWith('https://').max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** This browser's push subscription, kept for whoever is signed in on it. */
export async function savePushSubscription(
  subscription: z.input<typeof Subscription>,
  userAgent: string | null,
): Promise<ActionOutcome> {
  const parsed = Subscription.safeParse(subscription);
  if (!parsed.success) return refused('This browser’s subscription is not valid.');
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: userAgent?.slice(0, 300) ?? undefined,
  });
  return error ? refused(error.message) : { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionOutcome> {
  const parsed = z.url().safeParse(endpoint);
  if (!parsed.success) return refused('That is not a subscription.');
  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', parsed.data);
  return error ? refused(error.message) : { ok: true };
}

/** One pool's notification settings for me (0059): read when the bell's gear opens them. */
export async function loadPoolNotificationPrefs(poolId: string): Promise<PoolNotificationPrefs> {
  if (!z.uuid().safeParse(poolId).success) throw new Error('That Pool is not known.');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again.');
  return getPoolNotificationPrefs(supabase, poolId, user.id);
}

/** Mine in every pool I am in (0059), for Home's notification settings: one group per pool. */
export async function loadMyPoolsNotificationPrefs(): Promise<
  { poolId: string; name: string; prefs: PoolNotificationPrefs }[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again.');
  const pools = await getMyPoolNames(supabase, user.id);
  const prefs = await Promise.all(
    pools.map((p) => getPoolNotificationPrefs(supabase, p.id, user.id)),
  );
  return pools.map((p, at) => ({ poolId: p.id, name: p.name, prefs: prefs[at] }));
}
