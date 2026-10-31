import { createClient as createServiceClient } from '@supabase/supabase-js';
import webpush from 'web-push';

import type { Database } from '@/lib/database.types';
import { supabaseServiceRoleKey, supabaseUrl, vapidKeys } from '@/lib/env';
import { reportFailure } from '@/lib/report-failure';

import { deliver, pushPayload, type PushRow, type Send, type Subscription } from './push';

/** A notification the dispatcher reaches later than this is never pushed (H32). */
const TOO_LATE_MS = 10 * 60 * 1000;

/** A day: a phone that is off for longer gets the list, not a stale buzz. */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Pushes what this person's action left unsent (H32), after the action has
 * responded (`pushAfter`). Claims the rows first, so two dispatchers never
 * push one twice; a row too old, or without keys or a subscription, is
 * claimed and left for the list alone. Uses the service role: it reads
 * other people's subscriptions and settings, and nothing it reads reaches
 * the actor.
 */
export async function dispatchPushes(actorId: string): Promise<void> {
  const service = createServiceClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
  const { data: claimed, error } = await service
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('actor_id', actorId)
    .is('pushed_at', null)
    .select(
      'id, type, recipient_id, pool_id, splash_id, ripple_id, reply_id, invited, count, created_at',
    );
  if (error) throw error;
  const keys = vapidKeys();
  const now = Date.now();
  // About a record only: one about the pool ("owner", 0063) is written as
  // pushed already, and would never be claimed here.
  const due = (claimed ?? []).flatMap((row) =>
    row.splash_id && row.type !== 'owner' && now - Date.parse(row.created_at) < TOO_LATE_MS
      ? [{ ...row, splash_id: row.splash_id }]
      : [],
  );
  if (!keys || due.length === 0) return;

  const recipients = [...new Set(due.map((row) => row.recipient_id))];
  const [subscriptions, settings, pools, actor] = await Promise.all([
    service
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', recipients),
    service.from('notification_settings').select('user_id, show_titles').in('user_id', recipients),
    service
      .from('pools')
      .select('id, name')
      .in('id', [...new Set(due.map((row) => row.pool_id))]),
    service.from('profiles').select('display_name').eq('id', actorId).single(),
  ]);
  const byUser = new Map<string, Subscription[]>();
  for (const s of subscriptions.data ?? []) {
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  }
  const showsTitles = new Set(
    (settings.data ?? []).filter((s) => s.show_titles).map((s) => s.user_id),
  );
  const poolNames = new Map((pools.data ?? []).map((p) => [p.id, p.name]));
  const titled = due.filter((row) => showsTitles.has(row.recipient_id));
  const titles = new Map<string, string>();
  if (titled.length > 0) {
    const { data } = await service
      .from('splashes')
      .select('id, title')
      .in('id', [...new Set(titled.map((row) => row.splash_id))]);
    for (const s of data ?? []) titles.set(s.id, s.title);
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  const send: Send = async (subscription, body) => {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      body,
      { TTL: TTL_SECONDS },
    );
  };

  for (const row of due) {
    const targets = byUser.get(row.recipient_id) ?? [];
    if (targets.length === 0) continue;
    const { count: unread } = await service
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', row.recipient_id)
      .is('read_at', null);
    const payload = pushPayload(row as PushRow, {
      actorName: actor.data?.display_name ?? 'Someone',
      poolName: poolNames.get(row.pool_id) ?? 'a pool',
      title: showsTitles.has(row.recipient_id) ? (titles.get(row.splash_id) ?? null) : null,
      unread: unread ?? 0,
    });
    const result = await deliver(targets, payload, send);
    if (result.gone.length > 0) {
      await service.from('push_subscriptions').delete().in('id', result.gone);
    }
    if (result.sent.length > 0) {
      const at = new Date().toISOString();
      await Promise.all([
        service.from('push_subscriptions').update({ last_used_at: at }).in('id', result.sent),
        // Sent, for the dashboard's tap rate (H71): pushed_at is only claimed.
        service.from('notifications').update({ delivered_at: at }).eq('id', row.id),
      ]);
    }
    // The status alone: never the endpoint, the payload or whose it was.
    for (const failure of result.failed) {
      reportFailure('push', new Error(`push service answered ${failure.status ?? 'nothing'}`));
    }
  }
}
