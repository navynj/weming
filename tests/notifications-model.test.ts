import { describe, expect, it } from 'vitest';

import {
  APP_DEFAULTS,
  effectiveValue,
  NOTIFICATION_TYPES,
  notificationPath,
  notificationText,
  VALUES,
  type NotificationValue,
} from '@/lib/notifications/model';
import { deliver, pushPayload, type PushRow, type Subscription } from '@/lib/notifications/push';

/** Notifications' shared model (H32): resolution, words, URLs, delivery. */

describe('the effective value', () => {
  it('is paused ? off : mine ?? the pool default ?? the app default, in every combination', () => {
    for (const type of NOTIFICATION_TYPES) {
      const options: (NotificationValue | null)[] = [null, ...VALUES[type]];
      for (const paused of [false, true]) {
        for (const personal of options) {
          for (const poolDefault of options) {
            const expected = paused ? 'off' : (personal ?? poolDefault ?? APP_DEFAULTS[type]);
            expect(effectiveValue(type, { paused, personal, poolDefault })).toBe(expected);
          }
        }
      }
    }
  });

  it('starts a pool on Only when invited, Replies on, Reactions off', () => {
    expect(APP_DEFAULTS).toEqual({ new_post: 'invited', reply: 'on', reaction: 'off' });
  });
});

describe('the words', () => {
  const base = { invited: false, count: 1, actorName: 'Mina', poolName: 'Our Pool' };

  it('says who and where, never what', () => {
    expect(notificationText({ ...base, type: 'reply' })).toBe('Mina replied in Our Pool');
    expect(notificationText({ ...base, type: 'new_post' })).toBe('Mina posted in Our Pool');
    expect(notificationText({ ...base, type: 'reaction' })).toBe('Mina reacted in Our Pool');
  });

  it('tells the new owner who handed the pool on (0063)', () => {
    expect(notificationText({ ...base, type: 'owner' })).toBe(
      'Mina made you the owner of Our Pool',
    );
  });

  it('phrases an invited post as an invite', () => {
    expect(notificationText({ ...base, type: 'new_post', invited: true })).toBe(
      'Mina invited you to add your side in Our Pool',
    );
  });

  it('counts reactions folded within the hour', () => {
    expect(notificationText({ ...base, type: 'reaction', count: 3 })).toBe(
      '3 reactions in Our Pool, the latest from Mina',
    );
  });

  it('carries a title only when given', () => {
    expect(notificationText({ ...base, type: 'reply', title: 'Tofino' })).toBe(
      'Mina replied on “Tofino” in Our Pool',
    );
    expect(notificationText({ ...base, type: 'reply', title: '  ' })).toBe(
      'Mina replied in Our Pool',
    );
  });
});

describe('where a notification opens', () => {
  it('opens the record in its pool, at the reply, else the block, else the top (H42d)', () => {
    const at = { poolId: 'p', splashId: 's' };
    expect(notificationPath({ ...at, rippleId: 'r', replyId: 'y' })).toBe(
      '/pool/p/splash/s#reply-y',
    );
    expect(notificationPath({ ...at, rippleId: 'r', replyId: null })).toBe(
      '/pool/p/splash/s#block-r',
    );
    expect(notificationPath({ ...at, rippleId: null, replyId: null })).toBe('/pool/p/splash/s');
    // About the pool itself (0063): the pool.
    expect(notificationPath({ ...at, splashId: null, rippleId: null, replyId: null })).toBe(
      '/pool/p',
    );
  });
});

describe('the push payload', () => {
  const row: PushRow = {
    id: 'n1',
    type: 'reply',
    pool_id: 'p1',
    splash_id: 's1',
    ripple_id: 'r1',
    reply_id: 'y1',
    invited: false,
    count: 1,
  };

  it('carries no title unless the recipient shows titles', () => {
    const plain = pushPayload(row, {
      actorName: 'Mina',
      poolName: 'Our Pool',
      title: null,
      unread: 2,
    });
    expect(plain).toEqual({
      title: 'Weming',
      body: 'Mina replied in Our Pool',
      // Marked as this push's (H71), the hash kept last.
      url: '/pool/p1/splash/s1?src=notif&nid=n1#reply-y1',
      tag: 'n1',
      unread: 2,
    });
    expect(JSON.stringify(plain)).not.toContain('Tofino');
    const titled = pushPayload(row, {
      actorName: 'Mina',
      poolName: 'Our Pool',
      title: 'Tofino',
      unread: 2,
    });
    expect(titled.body).toBe('Mina replied on “Tofino” in Our Pool');
  });

  it('lets a pool’s reactions replace one another', () => {
    const reaction = pushPayload(
      { ...row, type: 'reaction', reply_id: null },
      { actorName: 'Mina', poolName: 'Our Pool', title: null, unread: 1 },
    );
    expect(reaction.tag).toBe('reaction:p1');
  });
});

describe('delivery', () => {
  const sub = (id: string): Subscription => ({
    id,
    endpoint: `https://push/${id}`,
    p256dh: 'k',
    auth: 'a',
  });
  const payload = pushPayload(
    {
      id: 'n',
      type: 'new_post',
      pool_id: 'p',
      splash_id: 's',
      ripple_id: null,
      reply_id: null,
      invited: true,
      count: 1,
    },
    { actorName: 'Mina', poolName: 'Our Pool', title: null, unread: 1 },
  );
  const refusal = (statusCode: number) => Object.assign(new Error('refused'), { statusCode });

  it('retries once, then gives up and reports the status', async () => {
    const tries: string[] = [];
    const result = await deliver([sub('a')], payload, async (s) => {
      tries.push(s.id);
      throw refusal(500);
    });
    expect(tries).toEqual(['a', 'a']);
    expect(result).toEqual({ sent: [], gone: [], failed: [{ id: 'a', status: 500 }] });
  });

  it('succeeds on the retry', async () => {
    let first = true;
    const result = await deliver([sub('a')], payload, async () => {
      if (first) {
        first = false;
        throw new Error('network');
      }
    });
    expect(result.sent).toEqual(['a']);
    expect(result.failed).toEqual([]);
  });

  it('marks a 404 or 410 gone, without a retry', async () => {
    const tries: string[] = [];
    const result = await deliver([sub('a'), sub('b'), sub('c')], payload, async (s) => {
      tries.push(s.id);
      if (s.id === 'a') throw refusal(404);
      if (s.id === 'b') throw refusal(410);
    });
    expect(tries.sort()).toEqual(['a', 'b', 'c']);
    expect(result.gone.sort()).toEqual(['a', 'b']);
    expect(result.sent).toEqual(['c']);
  });

  it('sends the payload as JSON, words and URL only', async () => {
    const bodies: string[] = [];
    await deliver([sub('a')], payload, async (_s, body) => {
      bodies.push(body);
    });
    expect(JSON.parse(bodies[0])).toEqual({
      title: 'Weming',
      body: 'Mina invited you to add your side in Our Pool',
      url: '/pool/p/splash/s?src=notif&nid=n',
      tag: 'n',
      unread: 1,
    });
  });
});
