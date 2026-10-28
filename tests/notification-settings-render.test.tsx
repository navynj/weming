// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let refuse = false;
const saves: unknown[] = [];
vi.mock('@/features/notifications/actions', () => ({
  loadNotificationSettings: () => Promise.resolve({ paused: false, showTitles: false }),
  setNotificationSettings: (input: unknown) => {
    saves.push(input);
    return Promise.resolve(refuse ? { ok: false, message: 'Sign in again.' } : { ok: true });
  },
  savePushSubscription: () => Promise.resolve({ ok: true }),
  removePushSubscription: () => Promise.resolve({ ok: true }),
}));

import { TurnOnNotifications } from '@/features/install/turn-on';
import { GlobalNotificationSwitches } from '@/features/notifications/notification-settings';

afterEach(() => {
  cleanup();
  saves.length = 0;
  refuse = false;
});

const toggle = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!;

describe('settings → notifications (H32)', () => {
  it('starts with neither on: not paused, no titles on the lock screen', async () => {
    const { container } = render(<GlobalNotificationSwitches />);
    await waitFor(() => expect(toggle(container, 'Pause all notifications').disabled).toBe(false));
    expect(toggle(container, 'Pause all notifications').getAttribute('aria-checked')).toBe('false');
    expect(toggle(container, 'Show titles in notifications').getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('pauses at once and saves behind it', async () => {
    const { container } = render(<GlobalNotificationSwitches />);
    await waitFor(() => expect(toggle(container, 'Pause all notifications').disabled).toBe(false));
    fireEvent.click(toggle(container, 'Pause all notifications'));
    expect(toggle(container, 'Pause all notifications').getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(saves).toEqual([{ paused: true, showTitles: false }]));
  });

  it('takes a refused change back and says why', async () => {
    refuse = true;
    const { container, findByRole } = render(<GlobalNotificationSwitches />);
    await waitFor(() =>
      expect(toggle(container, 'Show titles in notifications').disabled).toBe(false),
    );
    fireEvent.click(toggle(container, 'Show titles in notifications'));
    expect((await findByRole('alert')).textContent).toBe('Sign in again.');
    expect(toggle(container, 'Show titles in notifications').getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('says so where this browser cannot show notifications', async () => {
    const { container } = render(<TurnOnNotifications inSheet />);
    await waitFor(() =>
      expect(container.querySelector('[data-turn-on]')!.textContent).toContain(
        'The bell still collects them',
      ),
    );
  });
});
