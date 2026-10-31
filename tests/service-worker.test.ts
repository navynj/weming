import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * public/sw.js (H32), run as the browser would run it: the file's own code
 * in a context whose `self` records what it is asked to do.
 */
const SOURCE = readFileSync('public/sw.js', 'utf8');
const ORIGIN = 'https://weming.test';

type Client = { url: string; focused: boolean; messages: unknown[] };

function worker(windows: Client[] = []) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const badges: (number | 'clear')[] = [];
  const self = {
    location: { origin: ORIGIN },
    navigator: {
      setAppBadge: async (n: number) => void badges.push(n),
      clearAppBadge: async () => void badges.push('clear'),
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
    skipWaiting: () => {},
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) =>
        void shown.push({ title, options }),
    },
    clients: {
      claim: async () => {},
      matchAll: async () =>
        windows.map((w) => ({
          url: w.url,
          focus: async () => {
            w.focused = true;
          },
          postMessage: (message: unknown) => w.messages.push(message),
        })),
      openWindow: async (url: string) => void opened.push(url),
    },
  };
  runInNewContext(SOURCE, { self, URL, Promise, JSON });

  async function fire(type: string, event: Record<string, unknown>): Promise<void> {
    let done: Promise<unknown> = Promise.resolve();
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  }
  return { fire, shown, opened, badges };
}

const click = (url: unknown) => ({
  notification: { data: { url }, close: () => {} },
});

describe('the push worker', () => {
  it('shows who and where, and badges the unread count', async () => {
    const sw = worker();
    await sw.fire('push', {
      data: {
        json: () => ({
          title: 'Weming',
          body: 'Mina replied in Our Pool',
          url: '/splash/s#reply-y',
          tag: 'n1',
          unread: 3,
        }),
      },
    });
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe('Weming');
    expect(sw.shown[0].options).toMatchObject({
      body: 'Mina replied in Our Pool',
      tag: 'n1',
      data: { url: '/splash/s#reply-y' },
    });
    expect(sw.badges).toEqual([3]);
  });

  it('focuses an open window and sends it to the record', async () => {
    const open: Client = { url: `${ORIGIN}/pool/p`, focused: false, messages: [] };
    const sw = worker([open]);
    await sw.fire('notificationclick', click('/splash/s#block-r'));
    expect(open.focused).toBe(true);
    expect(open.messages).toEqual([{ type: 'weming:open', url: '/splash/s#block-r' }]);
    expect(sw.opened).toEqual([]);
  });

  it("keeps a push's open marker on the way to the app (H71)", async () => {
    const open: Client = { url: `${ORIGIN}/pool/p`, focused: false, messages: [] };
    const sw = worker([open]);
    await sw.fire('notificationclick', click('/splash/s?src=notif&nid=n1#block-r'));
    expect(open.messages).toEqual([
      { type: 'weming:open', url: '/splash/s?src=notif&nid=n1#block-r' },
    ]);
    const cold = worker([]);
    await cold.fire('notificationclick', click('/splash/s?src=notif&nid=n1'));
    expect(cold.opened).toEqual([`${ORIGIN}/splash/s?src=notif&nid=n1`]);
  });

  it('opens a window at the record when none is open', async () => {
    const elsewhere: Client = { url: 'https://other.test/', focused: false, messages: [] };
    const sw = worker([elsewhere]);
    await sw.fire('notificationclick', click('/splash/s#reply-y'));
    expect(sw.opened).toEqual([`${ORIGIN}/splash/s#reply-y`]);
    expect(elsewhere.focused).toBe(false);
  });

  it('opens nothing off this origin', async () => {
    const sw = worker();
    await sw.fire('notificationclick', click('https://evil.test/x'));
    await sw.fire('notificationclick', click('//evil.test/x'));
    expect(sw.opened).toEqual([`${ORIGIN}/`, `${ORIGIN}/`]);
  });
});
