// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/p-a/settings',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const renamed: [string, string][] = [];
const invitedAll: [string, boolean][] = [];
const onHome: [string, boolean][] = [];
vi.mock('@/features/pool/actions', () => ({
  renamePool: (poolId: string, name: string) => {
    renamed.push([poolId, name]);
    return Promise.resolve({ ok: true });
  },
  setLaneLinks: () => Promise.resolve({ ok: true }),
  setPoolInviteAll: (poolId: string, on: boolean) => {
    invitedAll.push([poolId, on]);
    return Promise.resolve({ ok: true });
  },
  setPoolOnHome: (poolId: string, on: boolean) => {
    onHome.push([poolId, on]);
    return Promise.resolve({ ok: true });
  },
  leavePool: () => Promise.resolve({ ok: true }),
  createInvite: () => Promise.resolve({ ok: false, message: 'not in tests' }),
  revokeInvite: () => Promise.resolve({ ok: true }),
  deletePool: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/lanes/actions', () => ({ saveLane: () => Promise.resolve({ ok: true }) }));
const prefs: [string, unknown][] = [];
vi.mock('@/features/notifications/actions', () => ({
  setMyNotificationPref: (input: unknown) => {
    prefs.push(['mine', input]);
    return Promise.resolve({ ok: true });
  },
  setPoolNotificationDefault: (input: unknown) => {
    prefs.push(['default', input]);
    return Promise.resolve({ ok: true });
  },
}));

import { PoolSettings } from '@/features/pool/settings';
import type { PoolView } from '@/lib/queries/pools';
import type { PoolNotificationPrefs } from '@/lib/queries/notifications';

const NO_PREFS: PoolNotificationPrefs = { poolDefaults: {}, mine: {}, paused: false };

afterEach(() => {
  cleanup();
  renamed.length = 0;
  invitedAll.length = 0;
  onHome.length = 0;
  prefs.length = 0;
});

const view = (ownerId: string, inviteAllByDefault = false): PoolView => ({
  pool: { id: 'p-a', name: 'Our Pool', ownerId, inviteAllByDefault },
  members: [],
  lanes: [],
  myLinks: [],
  placements: [],
  splashes: [],
  ripples: [],
  invites: [],
});

describe('renaming the pool in settings (0021)', () => {
  it('is offered to its creator, shows at once, and saves trimmed', async () => {
    const { container, getByLabelText } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-me')} categories={[]} me="u-me" />,
    );
    const save = container.querySelector<HTMLButtonElement>('[data-save-name]')!;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText('Pool name'), { target: { value: '  Sarang  ' } });
    fireEvent.click(save);
    expect(container.textContent).toContain('Sarang');
    await waitFor(() => expect(renamed).toEqual([['p-a', 'Sarang']]));
  });

  it('is not offered to any other member', () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-other')} categories={[]} me="u-me" />,
    );
    expect(container.querySelector('[data-settings-name]')).toBeNull();
  });
});

describe('inviting everyone to new posts by default (0033)', () => {
  const toggle = (root: HTMLElement) =>
    root.querySelector('[data-settings-invite-all] [role="switch"]') as HTMLButtonElement;

  it('starts as the pool has it, and saves a flip at once', async () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-other')} categories={[]} me="u-me" />,
    );
    expect(container.textContent).toContain('Invite everyone to new posts by default');
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', true]]));
  });

  it('turns off a pool that has it on', async () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-me', true)} categories={[]} me="u-me" />,
    );
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', false]]));
  });
});

describe('Connect your lanes, under Advanced (0033)', () => {
  it('stays folded until Advanced is opened', () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-me')} categories={[]} me="u-me" />,
    );
    const advanced = container.querySelector<HTMLButtonElement>('[data-settings-advanced-toggle]')!;
    expect(advanced.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-lane-match]')).toBeNull();
    fireEvent.click(advanced);
    expect(advanced.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-lane-match]')!.textContent).toContain(
      'Connect your lanes',
    );
  });
});

describe('my own settings for a pool (0039)', () => {
  it('keeps what I wrote here off my Home with one switch, on by default', () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-other')} categories={[]} me="u-me" />,
    );
    const toggle = container.querySelector('[data-settings-on-home] [role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onHome).toEqual([['p-a', false]]);
  });

  it('offers a member Leave Pool where the creator has Delete Pool', () => {
    const member = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-other')} categories={[]} me="u-me" />,
    );
    expect(member.container.querySelector('[data-delete-pool]')).toBeNull();
    fireEvent.click(member.container.querySelector('[data-settings-leave-pool]')!);
    expect(member.getByText('Keep your records in this Pool?')).toBeTruthy();
    member.unmount();
    const creator = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-me')} categories={[]} me="u-me" />,
    );
    expect(creator.container.querySelector('[data-delete-pool]')).not.toBeNull();
    expect(creator.container.querySelector('[data-settings-leave-pool]')).toBeNull();
  });
});

describe('notifications in pool settings (H32)', () => {
  it('starts every type of mine on Use pool default, naming the pool’s value', () => {
    const { container } = render(
      <PoolSettings
        view={view('u-other')}
        categories={[]}
        me="u-me"
        notifications={{ poolDefaults: { reply: 'off' }, mine: {}, paused: false }}
      />,
    );
    const pick = (data: string) =>
      container.querySelector<HTMLButtonElement>(`[data-notification-choice="${data}"]`)!;
    for (const type of ['new_post', 'reply', 'reaction']) {
      expect(pick(`mine-${type}-default`).getAttribute('aria-pressed')).toBe('true');
    }
    expect(pick('mine-new_post-default').textContent).toContain('Only when I’m invited');
    expect(pick('mine-reply-default').textContent).toContain('Off');
    expect(pick('mine-reaction-default').textContent).toContain('Off');
  });

  it('lets a member set their own, and shows the defaults read-only', async () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-other')} categories={[]} me="u-me" />,
    );
    expect(container.querySelector('[data-notification-choice^="default-"]')).toBeNull();
    expect(container.querySelector('[data-default="new_post"]')!.textContent).toContain(
      'Only when I’m invited',
    );
    const all = container.querySelector<HTMLButtonElement>(
      '[data-notification-choice="mine-new_post-all"]',
    )!;
    fireEvent.click(all);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(prefs).toEqual([['mine', { poolId: 'p-a', type: 'new_post', value: 'all' }]]),
    );
  });

  it('lets the creator set the defaults for members', async () => {
    const { container } = render(
      <PoolSettings notifications={NO_PREFS} view={view('u-me')} categories={[]} me="u-me" />,
    );
    const on = container.querySelector<HTMLButtonElement>(
      '[data-notification-choice="default-reaction-on"]',
    )!;
    expect(on.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(on);
    expect(on.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(prefs).toEqual([['default', { poolId: 'p-a', type: 'reaction', value: 'on' }]]),
    );
  });
});
