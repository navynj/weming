/**
 * Notifications (H32), the parts the browser and the server share: the
 * types and their values, the effective value, the words and the URL.
 */

export type NotificationType = 'new_post' | 'reply' | 'reaction';
export type NewPostValue = 'all' | 'invited' | 'off';
export type SwitchValue = 'on' | 'off';
export type NotificationValue = NewPostValue | SwitchValue;

export const NOTIFICATION_TYPES: readonly NotificationType[] = ['new_post', 'reply', 'reaction'];

export const VALUES: Record<NotificationType, readonly NotificationValue[]> = {
  new_post: ['all', 'invited', 'off'],
  reply: ['on', 'off'],
  reaction: ['on', 'off'],
};

/** What a pool starts with, read whenever it has no default of its own. */
export const APP_DEFAULTS: Record<NotificationType, NotificationValue> = {
  new_post: 'invited',
  reply: 'on',
  reaction: 'off',
};

export const TYPE_LABELS: Record<NotificationType, string> = {
  new_post: 'New posts',
  reply: 'Replies',
  reaction: 'Reactions',
};

export const VALUE_LABELS: Record<NotificationValue, string> = {
  all: 'All',
  invited: 'Only when I’m invited',
  off: 'Off',
  on: 'On',
};

export function isValue(type: NotificationType, value: string): value is NotificationValue {
  return (VALUES[type] as readonly string[]).includes(value);
}

/** paused ? off : mine ?? the pool's default ?? the app's (H32); `_notification_value` in SQL. */
export function effectiveValue(
  type: NotificationType,
  {
    paused,
    personal,
    poolDefault,
  }: {
    paused: boolean;
    personal: NotificationValue | null;
    poolDefault: NotificationValue | null;
  },
): NotificationValue {
  if (paused) return 'off';
  return personal ?? poolDefault ?? APP_DEFAULTS[type];
}

export type NotificationFacts = {
  type: NotificationType;
  invited: boolean;
  count: number;
  actorName: string;
  poolName: string;
  /** The record's title, given only when the person shows titles. */
  title?: string | null;
};

/**
 * The words, for the list and the lock screen alike: who and where, never
 * what was written. The record's title only when it is given (H32: Show
 * titles in notifications).
 */
export function notificationText(facts: NotificationFacts): string {
  const { actorName, poolName } = facts;
  const title = facts.title?.trim() ? `“${facts.title.trim()}”` : null;
  switch (facts.type) {
    case 'new_post':
      if (facts.invited) {
        return title
          ? `${actorName} invited you to add your side to ${title} in ${poolName}`
          : `${actorName} invited you to add your side in ${poolName}`;
      }
      return title
        ? `${actorName} posted ${title} in ${poolName}`
        : `${actorName} posted in ${poolName}`;
    case 'reply':
      return title
        ? `${actorName} replied on ${title} in ${poolName}`
        : `${actorName} replied in ${poolName}`;
    case 'reaction': {
      // The count is reactions folded within the hour, not people.
      const where = title ? `on ${title} in ${poolName}` : `in ${poolName}`;
      return facts.count > 1
        ? `${facts.count} reactions ${where}, the latest from ${actorName}`
        : `${actorName} reacted ${where}`;
    }
  }
}

/** Where a notification opens: the record, at the reply or the block. */
export function notificationPath(target: {
  splashId: string;
  rippleId: string | null;
  replyId: string | null;
}): string {
  const base = `/splash/${target.splashId}`;
  if (target.replyId) return `${base}#reply-${target.replyId}`;
  if (target.rippleId) return `${base}#block-${target.rippleId}`;
  return base;
}
