import { notificationPath, notificationText, type NotificationType } from './model';

/**
 * What one push carries (H32): who and where, the URL to open, the unread
 * count for the app badge. Never what anyone wrote; the record's title only
 * when its recipient shows titles.
 */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  unread: number;
};

export type PushRow = {
  id: string;
  type: NotificationType;
  pool_id: string;
  splash_id: string;
  ripple_id: string | null;
  reply_id: string | null;
  invited: boolean;
  count: number;
};

export function pushPayload(
  row: PushRow,
  facts: { actorName: string; poolName: string; title: string | null; unread: number },
): PushPayload {
  return {
    title: 'Weming',
    body: notificationText({
      type: row.type,
      invited: row.invited,
      count: row.count,
      actorName: facts.actorName,
      poolName: facts.poolName,
      title: facts.title,
    }),
    url: notificationPath({
      poolId: row.pool_id,
      splashId: row.splash_id,
      rippleId: row.ripple_id,
      replyId: row.reply_id,
    }),
    // A pool's reactions replace one another on the lock screen, as they
    // fold into one notification in the list.
    tag: row.type === 'reaction' ? `reaction:${row.pool_id}` : row.id,
    unread: facts.unread,
  };
}

export type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

/** Sends one push; throws with `statusCode` when the push service refuses. */
export type Send = (subscription: Subscription, body: string) => Promise<void>;

export type Delivery = {
  sent: string[];
  gone: string[];
  failed: { id: string; status: number | null }[];
};

function statusOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : null;
}

/**
 * To every subscription: once, and once more on a failure; a 404 or 410
 * means the browser dropped it, so it is to be deleted, not retried.
 */
export async function deliver(
  subscriptions: Subscription[],
  payload: PushPayload,
  send: Send,
): Promise<Delivery> {
  const body = JSON.stringify(payload);
  const result: Delivery = { sent: [], gone: [], failed: [] };
  await Promise.all(
    subscriptions.map(async (subscription) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await send(subscription, body);
          result.sent.push(subscription.id);
          return;
        } catch (error) {
          const status = statusOf(error);
          if (status === 404 || status === 410) {
            result.gone.push(subscription.id);
            return;
          }
          if (attempt === 1) result.failed.push({ id: subscription.id, status });
        }
      }
    }),
  );
  return result;
}
