// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: 'welcome=1', path: '/pool/p-a' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const saved = vi.hoisted(() => [] as unknown[]);
vi.mock('@/features/notifications/actions', () => ({
  setMyNotificationPref: (input: unknown) => {
    saved.push(input);
    return Promise.resolve({ ok: true });
  },
  loadNotificationSettings: () => Promise.resolve({ paused: false, showTitles: false }),
  setNotificationSettings: () => Promise.resolve({ ok: true }),
}));
const device = vi.hoisted(() => ({
  state: 'off' as string,
  canPrompt: false,
  calls: [] as string[],
}));
vi.mock('@/features/notifications/push-client', () => ({
  isStandalone: () => false,
  pushState: () => Promise.resolve(device.state),
  enablePush: () => {
    device.calls.push('permission');
    device.state = 'on';
    return Promise.resolve(null);
  },
  disablePush: () => Promise.resolve(null),
}));
vi.mock('@/features/install/install-state', () => ({
  subscribeInstall: () => () => {},
  canPromptInstall: () => device.canPrompt,
  promptInstall: () => {
    device.calls.push('install');
    return Promise.resolve(true);
  },
}));

import { NotifyCard } from '@/features/notifications/notify-card';
import type { PoolNotificationPrefs } from '@/lib/queries/notifications';

const PREFS: PoolNotificationPrefs = {
  // The pool's creator turned reactions on; I set new posts to All myself.
  poolDefaults: { reaction: 'on' },
  mine: { new_post: 'all' },
  paused: false,
};

beforeEach(() => {
  nav.search = 'welcome=1';
  saved.length = 0;
  device.state = 'off';
  device.canPrompt = false;
  device.calls = [];
});
afterEach(cleanup);

const pressed = (root: Element) =>
  [...root.querySelectorAll('[data-notification-choice][aria-pressed="true"]')].map((chip) =>
    chip.getAttribute('data-notification-choice'),
  );

const poolCard = (prefs: PoolNotificationPrefs = PREFS) =>
  render(<NotifyCard pool={{ id: 'p-a', name: 'Sarang', prefs }} />);

describe('the notifications card after joining or opening a pool (review)', () => {
  it('shows each type at its effective value for me here: mine, else the pool’s, else the app’s', async () => {
    const { container } = poolCard();
    await waitFor(() => expect(container.querySelector('[data-turn-on]')).not.toBeNull());
    expect(pressed(container)).toEqual(['card-new_post-all', 'card-reply-on', 'card-reaction-on']);
  });

  it('changes a type in place, at once, saved as mine for this pool', async () => {
    const { container } = poolCard();
    fireEvent.click(container.querySelector('[data-notification-choice="card-reply-off"]')!);
    expect(pressed(container)).toContain('card-reply-off');
    await waitFor(() => expect(saved).toEqual([{ poolId: 'p-a', type: 'reply', value: 'off' }]));
  });

  it('reads every type as off while notifications are paused, and says so', () => {
    const { container } = poolCard({ ...PREFS, paused: true });
    expect(container.querySelector('[data-notifications-paused]')).not.toBeNull();
    expect(pressed(container)).toEqual([
      'card-new_post-off',
      'card-reply-off',
      'card-reaction-off',
    ]);
  });

  it('goes with Not now, the flag taken off the URL, every setting left as it was', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const { container } = poolCard();
    fireEvent.click(container.querySelector('[data-notify-not-now]')!);
    expect(container.querySelector('[data-notify-card]')).toBeNull();
    expect(replace).toHaveBeenCalledWith(null, '', '/pool/p-a');
    expect(saved).toEqual([]);
    replace.mockRestore();
  });

  it('is not there without the flag', () => {
    nav.search = '';
    expect(poolCard().container.querySelector('[data-notify-card]')).toBeNull();
  });
});

describe('the notifications card on Home after a first sign-in (review)', () => {
  it('holds only the switches that hold everywhere', async () => {
    nav.path = '/';
    const { container } = render(<NotifyCard />);
    expect(container.querySelector('[data-notify-card="home"]')).not.toBeNull();
    expect(container.querySelector('[data-notification-choice]')).toBeNull();
    await waitFor(() =>
      expect(container.querySelectorAll('[role="switch"]:not([disabled])').length).toBe(2),
    );
    nav.path = '/pool/p-a';
  });
});

describe('Turn on notifications does what the device needs (review)', () => {
  const press = async (container: HTMLElement) => {
    const button = await waitFor(() => {
      const found = container.querySelector<HTMLButtonElement>('[data-turn-on-notifications]');
      expect(found?.disabled).toBe(false);
      return found!;
    });
    await act(async () => fireEvent.click(button));
  };

  it('asks for permission where nothing needs installing', async () => {
    const { container } = poolCard();
    await press(container);
    expect(device.calls).toEqual(['permission']);
    await waitFor(() => expect(container.querySelector('[data-push-on]')).not.toBeNull());
  });

  it('installs first where Chromium offers it, then asks', async () => {
    device.canPrompt = true;
    const { container } = poolCard();
    await press(container);
    expect(device.calls).toEqual(['install', 'permission']);
  });

  it('shows the Add to Home Screen steps on iOS Safari, asking nothing', async () => {
    device.state = 'needs-install';
    const { container } = poolCard();
    await press(container);
    expect(container.querySelector('[data-ios-install-guide]')).not.toBeNull();
    expect(device.calls).toEqual([]);
  });

  it('says so, with no button, when they are already on', async () => {
    device.state = 'on';
    const { container } = poolCard();
    await waitFor(() => expect(container.querySelector('[data-push-on]')).not.toBeNull());
    expect(container.querySelector('[data-turn-on-notifications]')).toBeNull();
  });
});
