// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/pool/p-a',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock('@/features/notifications/actions', () => ({
  loadNotifications: () => Promise.resolve([]),
  loadUnreadCount: () => Promise.resolve(0),
  markNotificationsRead: () => Promise.resolve({ ok: true }),
  loadPoolNotificationPrefs: () => Promise.resolve({ poolDefaults: {}, mine: {}, paused: false }),
  loadMyPoolsNotificationPrefs: () => Promise.resolve([]),
  loadNotificationSettings: () => Promise.resolve({ paused: false, showTitles: false }),
  setNotificationSettings: () => Promise.resolve({ ok: true }),
  setMyNotificationPref: () => Promise.resolve({ ok: true }),
  setPoolNotificationDefault: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/install/install-state', () => ({
  offerInstall: () => {},
  onOfferInstall: () => () => {},
  subscribeInstall: () => () => {},
  canPromptInstall: () => false,
  promptInstall: () => Promise.resolve(false),
  dismissInstall: () => {},
}));
const device = vi.hoisted(() => ({ state: 'off' }));
vi.mock('@/features/notifications/push-client', () => ({
  isStandalone: () => false,
  pushState: () => Promise.resolve(device.state),
  enablePush: () => Promise.resolve(null),
  disablePush: () => {
    device.state = 'off';
    return Promise.resolve(null);
  },
  resyncPush: () => Promise.resolve(),
}));
const turnedOff = vi.hoisted(() => [] as string[]);
vi.mock('@/features/pool/actions', () => ({
  createInvite: () =>
    Promise.resolve({
      ok: true,
      id: 'i-new',
      token: 'newtoken',
      expiresAt: '2026-11-04T00:00:00Z',
    }),
  revokeInvite: (_pool: string, id: string) => {
    turnedOff.push(id);
    return Promise.resolve({ ok: true });
  },
}));

import { Bell } from '@/features/notifications/bell';
import { NotificationsProvider } from '@/features/notifications/notifications-provider';
import { InvitePanel } from '@/features/pool/invite-panel';
import type { PoolInvite } from '@/lib/queries/pools';

afterEach(() => {
  cleanup();
  turnedOff.length = 0;
});

describe('the bell (0059)', () => {
  it('opens with Turn on notifications when they are off, and its gear opens the settings', async () => {
    device.state = 'off';
    const { container } = render(
      <NotificationsProvider initialUnread={0}>
        <Bell place={{ poolId: 'p-a', name: 'Our Pool', isCreator: true }} />
      </NotificationsProvider>,
    );
    await act(async () => fireEvent.click(container.querySelector('[data-notifications-bell]')!));
    const doc = container.ownerDocument;
    await waitFor(() => expect(doc.querySelector('[data-turn-on-notifications]')).not.toBeNull());
    fireEvent.click(doc.querySelector('[data-notification-settings-open]')!);
    // The settings: the global switches, then this pool's, the defaults the creator's.
    expect(doc.querySelector('[data-notification-settings]')).not.toBeNull();
    await waitFor(() =>
      expect(doc.querySelector('[data-notification-group="defaults"]')).not.toBeNull(),
    );
    fireEvent.click(doc.querySelector('[data-notification-group="defaults"]')!);
    expect(doc.querySelector('[data-notification-choice^="default-"]')).not.toBeNull();
    // Off here: no Turn off at the bottom (it is for a device with them on).
    expect(doc.querySelector('[data-device-notifications-off]')).toBeNull();
    expect(doc.querySelector('[data-settings-notifications="p-a"]')!.textContent).toContain(
      'In Our Pool',
    );
  });
});

const invite = (over: Partial<PoolInvite>): PoolInvite =>
  ({
    id: 'i-1',
    pool_id: 'p-a',
    token: 'abc',
    created_by: 'u-me',
    created_at: '2026-10-27T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    revoked_at: null,
    ...over,
  }) as PoolInvite;

describe('invite links, in plain words (0059)', () => {
  it('says Make a link, Copy and Turn off link, and asks before turning one off', async () => {
    const { container, getByText } = render(<InvitePanel poolId="p-a" invites={[invite({})]} />);
    expect(getByText('Make a link')).toBeTruthy();
    expect(getByText('Copy')).toBeTruthy();
    fireEvent.click(getByText('Turn off link'));
    expect(container.querySelector('[data-invite-confirm]')!.textContent).toContain(
      'Turn off this link? Anyone who has it won’t be able to join with it. You can make a new one anytime.',
    );
    expect(getByText('Cancel')).toBeTruthy();
    fireEvent.click(getByText('Turn off'));
    await waitFor(() => expect(turnedOff).toEqual(['i-1']));
    expect(container.querySelector('[data-invite="abc"] [data-invite-dead]')!.textContent).toBe(
      'This link no longer works',
    );
  });

  it('shows a link that ran out or was turned off as no longer working, with nothing to press', () => {
    const { container } = render(
      <InvitePanel
        poolId="p-a"
        invites={[
          invite({ id: 'i-old', token: 'old', expires_at: '2020-01-01T00:00:00Z' }),
          invite({ id: 'i-off', token: 'off', revoked_at: '2026-10-27T01:00:00Z' }),
        ]}
      />,
    );
    for (const token of ['old', 'off']) {
      const row = container.querySelector(`[data-invite="${token}"]`)!;
      expect(row.textContent).toContain('This link no longer works');
      expect(row.querySelector('[data-copy-invite], [data-revoke-invite]')).toBeNull();
    }
    expect(container.textContent).not.toMatch(/revoke|token/i);
  });
});

describe('turning notifications off on this device (review)', () => {
  it('sits at the bottom of Notification settings while they are on, and unsubscribes', async () => {
    device.state = 'on';
    const { container } = render(
      <NotificationsProvider initialUnread={0}>
        <Bell />
      </NotificationsProvider>,
    );
    await act(async () => fireEvent.click(container.querySelector('[data-notifications-bell]')!));
    const doc = container.ownerDocument;
    // The list says nothing of it once they are on.
    expect(doc.querySelector('[data-turn-on]')).toBeNull();
    fireEvent.click(doc.querySelector('[data-notification-settings-open]')!);
    const off = await waitFor(() => {
      const found = doc.querySelector<HTMLButtonElement>('[data-device-notifications-off]');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(off.textContent).toBe('Turn off notifications on this device');
    expect(off.className).toContain('text-pool-500');
    await act(async () => fireEvent.click(off));
    await waitFor(() => expect(off.isConnected).toBe(false));
    device.state = 'off';
  });
});
