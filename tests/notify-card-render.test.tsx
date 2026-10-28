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

beforeEach(() => {
  nav.search = 'welcome=1';
  saved.length = 0;
  device.state = 'off';
  device.canPrompt = false;
  device.calls = [];
});
afterEach(cleanup);

const popup = () => render(<NotifyCard />);

describe('the Get notified popup after joining, opening a pool, or a first sign-in (review)', () => {
  it('is one button and nothing to set: the defaults apply', async () => {
    const { container } = popup();
    await waitFor(() =>
      expect(container.querySelector('[data-turn-on-notifications]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-notification-choice]')).toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });

  it('goes with Not now, the flag taken off the URL, nothing saved', () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const { container } = popup();
    fireEvent.click(container.querySelector('[data-notify-not-now]')!);
    expect(container.querySelector('[data-notify-card]')).toBeNull();
    expect(replace).toHaveBeenCalledWith(null, '', '/pool/p-a');
    expect(saved).toEqual([]);
    replace.mockRestore();
  });

  it('is not there without the flag', () => {
    nav.search = '';
    expect(popup().container.querySelector('[data-notify-card]')).toBeNull();
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
    const { container } = popup();
    await press(container);
    expect(device.calls).toEqual(['permission']);
    await waitFor(() => expect(container.querySelector('[data-push-on]')).not.toBeNull());
  });

  it('installs first where Chromium offers it, then asks', async () => {
    device.canPrompt = true;
    const { container } = popup();
    await press(container);
    expect(device.calls).toEqual(['install', 'permission']);
  });

  it('shows the Add to Home Screen steps on iOS Safari, asking nothing', async () => {
    device.state = 'needs-install';
    const { container } = popup();
    await press(container);
    expect(container.querySelector('[data-ios-install-guide]')).not.toBeNull();
    expect(device.calls).toEqual([]);
  });

  it('says so, with no button, when they are already on', async () => {
    device.state = 'on';
    const { container } = popup();
    await waitFor(() => expect(container.querySelector('[data-push-on]')).not.toBeNull());
    expect(container.querySelector('[data-turn-on-notifications]')).toBeNull();
  });
});
