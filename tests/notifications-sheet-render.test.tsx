// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pushed: string[] = [];
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (url: string) => pushed.push(url), refresh: () => {} }),
}));
const marked: (string[] | null)[] = [];
let rows: unknown[] = [];
vi.mock('@/features/notifications/actions', () => ({
  loadNotifications: () => Promise.resolve(rows),
  loadUnreadCount: () => Promise.resolve(0),
  markNotificationsRead: (ids: string[] | null) => {
    marked.push(ids);
    return Promise.resolve({ ok: true });
  },
}));
const offered: number[] = [];
vi.mock('@/features/install/install-state', () => ({
  offerInstall: () => offered.push(1),
  subscribeInstall: () => () => {},
  canPromptInstall: () => false,
  promptInstall: () => Promise.resolve(false),
}));
const device = vi.hoisted(() => ({ state: 'on' }));
vi.mock('@/features/notifications/push-client', () => ({
  isStandalone: () => false,
  pushState: () => Promise.resolve(device.state),
  enablePush: () => Promise.resolve(null),
  disablePush: () => {
    device.state = 'off';
    return Promise.resolve(null);
  },
}));

import { NotificationsSheet } from '@/features/notifications/notifications-sheet';
import type { NotificationItem } from '@/lib/queries/notifications';

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1',
  type: 'reply',
  invited: false,
  count: 1,
  createdAt: new Date().toISOString(),
  read: false,
  actorId: 'u-mina',
  actorName: 'Mina',
  poolName: 'Our Pool',
  title: null,
  splashId: 's1',
  rippleId: 'r1',
  replyId: 'y1',
  ...over,
});

/** Waits until the sheet has loaded the element. */
function find(container: HTMLElement, selector: string): Promise<HTMLButtonElement> {
  return waitFor(() => {
    const found = container.querySelector<HTMLButtonElement>(selector);
    if (!found) throw new Error(`no ${selector}`);
    return found;
  });
}

afterEach(() => {
  cleanup();
  pushed.length = 0;
  marked.length = 0;
  offered.length = 0;
});

describe('the notifications sheet (H32)', () => {
  it('says so when there is nothing', async () => {
    rows = [];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    await waitFor(() =>
      expect(container.querySelector('[data-notifications-empty]')!.textContent).toContain(
        'gather here',
      ),
    );
  });

  it('opens a reply at its reply, marking it read on the way', async () => {
    rows = [item({})];
    let closed = false;
    const { container } = render(<NotificationsSheet onClose={() => (closed = true)} />);
    const row = await find(container, '[data-notification="n1"]');
    expect(row.textContent).toContain('Mina replied in Our Pool');
    expect(row.hasAttribute('data-unread')).toBe(true);
    fireEvent.click(row);
    expect(pushed).toEqual(['/splash/s1#reply-y1']);
    expect(closed).toBe(true);
    await waitFor(() => expect(marked).toEqual([['n1']]));
    expect(offered).toEqual([]);
  });

  it('phrases an invite as an invite, opens the record, and offers install', async () => {
    rows = [item({ id: 'n2', type: 'new_post', invited: true, rippleId: null, replyId: null })];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    const row = await find(container, '[data-notification="n2"]');
    expect(row.textContent).toContain('Mina invited you to add your side in Our Pool');
    fireEvent.click(row);
    expect(pushed).toEqual(['/splash/s1']);
    expect(offered).toEqual([1]);
  });

  it('opens a reaction at its block', async () => {
    rows = [item({ id: 'n3', type: 'reaction', replyId: null, read: true })];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    const row = await find(container, '[data-notification="n3"]');
    fireEvent.click(row);
    expect(pushed).toEqual(['/splash/s1#block-r1']);
    // Already read: nothing to mark.
    expect(marked).toEqual([]);
  });

  it('marks all read at once', async () => {
    rows = [item({ id: 'a' }), item({ id: 'b' })];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    const all = await find(container, '[data-mark-all-read]');
    fireEvent.click(all);
    expect(container.querySelectorAll('[data-unread]')).toHaveLength(0);
    await waitFor(() => expect(marked).toEqual([null]));
  });
});

describe('the bell’s sheet offers to turn notifications on (review)', () => {
  it('shows Turn on notifications to someone who has not turned them on', async () => {
    device.state = 'off';
    rows = [];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    await waitFor(() =>
      expect(container.querySelector('[data-turn-on-notifications]')).not.toBeNull(),
    );
    device.state = 'on';
  });

  it('once they are on, turns them off from the same place', async () => {
    device.state = 'on';
    rows = [];
    const { container } = render(<NotificationsSheet onClose={() => {}} />);
    const off = await waitFor(() => {
      const found = container.querySelector<HTMLButtonElement>('[data-turn-off-notifications]');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(container.querySelector('[data-turn-on-notifications]')).toBeNull();
    fireEvent.click(off);
    await waitFor(() =>
      expect(container.querySelector('[data-turn-on-notifications]')).not.toBeNull(),
    );
    device.state = 'on';
  });
});
