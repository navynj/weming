import {
  isValue,
  NOTIFICATION_TYPES,
  type NotificationKind,
  type NotificationType,
  type NotificationValue,
} from '@/lib/notifications/model';
import type { DuringClient } from '@/lib/queries/profile';

/**
 * Notifications (H32). Each read goes through RLS: my own notifications,
 * and the record, the pool and the face only while I may still see them —
 * a notification whose record I can no longer read is dropped here.
 */

export type NotificationItem = {
  id: string;
  type: NotificationKind;
  invited: boolean;
  count: number;
  createdAt: string;
  read: boolean;
  actorId: string;
  actorName: string;
  poolName: string;
  title: string | null;
  /** The record's own icon, for its sheet's header before the page arrives. */
  icon: string | null;
  poolId: string;
  /** Null on one about the pool itself ("made you the owner", 0063). */
  splashId: string | null;
  rippleId: string | null;
  replyId: string | null;
};

/** How many are unread, for the bell's dot and the app badge. */
export async function getUnreadCount(supabase: DuringClient): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/** The newest first; enough for a sheet, not an archive. */
export async function getNotifications(
  supabase: DuringClient,
  limit = 60,
): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(
      'id, type, invited, count, created_at, read_at, actor_id, pool_id, splash_id, ripple_id, reply_id, actor:profiles!notifications_actor_id_fkey(display_name), pool:pools(name), splash:splashes(title, icon)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    row.pool && (row.splash || row.type === 'owner')
      ? [
          {
            id: row.id,
            type: row.type as NotificationKind,
            invited: row.invited,
            count: row.count,
            createdAt: row.created_at,
            read: row.read_at !== null,
            actorId: row.actor_id,
            actorName: row.actor?.display_name ?? 'Someone',
            poolName: row.pool.name,
            title: row.splash?.title || null,
            icon: row.splash?.icon || null,
            poolId: row.pool_id,
            splashId: row.splash_id,
            rippleId: row.ripple_id,
            replyId: row.reply_id,
          },
        ]
      : [],
  );
}

export type ValuesByType = Partial<Record<NotificationType, NotificationValue>>;

export type PoolNotificationPrefs = {
  poolDefaults: ValuesByType;
  mine: ValuesByType;
  paused: boolean;
};

function byType(rows: { type: string; value: string }[] | null): ValuesByType {
  const out: ValuesByType = {};
  for (const row of rows ?? []) {
    const type = row.type as NotificationType;
    if (NOTIFICATION_TYPES.includes(type) && isValue(type, row.value)) out[type] = row.value;
  }
  return out;
}

/** A pool's notification settings as I see them: its defaults, mine, and whether I paused. */
export async function getPoolNotificationPrefs(
  supabase: DuringClient,
  poolId: string,
  me: string,
): Promise<PoolNotificationPrefs> {
  const [defaults, mine, settings] = await Promise.all([
    supabase.from('pool_notification_defaults').select('type, value').eq('pool_id', poolId),
    supabase
      .from('member_notification_prefs')
      .select('type, value')
      .eq('pool_id', poolId)
      .eq('user_id', me),
    supabase.from('notification_settings').select('paused').eq('user_id', me).maybeSingle(),
  ]);
  if (defaults.error) throw defaults.error;
  if (mine.error) throw mine.error;
  return {
    poolDefaults: byType(defaults.data),
    mine: byType(mine.data),
    paused: settings.data?.paused ?? false,
  };
}

export type NotificationSettings = { paused: boolean; showTitles: boolean };

export async function getNotificationSettings(
  supabase: DuringClient,
  me: string,
): Promise<NotificationSettings> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('paused, show_titles')
    .eq('user_id', me)
    .maybeSingle();
  if (error) throw error;
  return { paused: data?.paused ?? false, showTitles: data?.show_titles ?? false };
}
