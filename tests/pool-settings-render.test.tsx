// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => '/pool/p-a',
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
const poolPrefs = vi.hoisted(() => ({
  next: { poolDefaults: {}, mine: {}, paused: false } as Record<string, unknown>,
}));
vi.mock('@/features/notifications/actions', () => ({
  loadPoolNotificationPrefs: () => Promise.resolve(poolPrefs.next),
  loadMyPoolsNotificationPrefs: () => Promise.resolve([]),
  loadNotificationSettings: () => Promise.resolve({ paused: false, showTitles: false }),
  setNotificationSettings: () => Promise.resolve({ ok: true }),
  setMyNotificationPref: (input: unknown) => {
    prefs.push(['mine', input]);
    return Promise.resolve({ ok: true });
  },
  setPoolNotificationDefault: (input: unknown) => {
    prefs.push(['default', input]);
    return Promise.resolve({ ok: true });
  },
}));

import { ShellDataProvider } from '@/features/home/shell-data';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { NotificationSettingsSheet } from '@/features/notifications/notification-settings-sheet';
import { PoolSettingsSheet } from '@/features/pool/settings';
import type { PoolView } from '@/lib/queries/pools';
import type { PoolNotificationPrefs } from '@/lib/queries/notifications';

// The sheet asks whether motion is reduced.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

/** The pool's settings sheet (0059), opened on a tab as its link would. */
function settings(of: PoolView, tab: 'pool' | 'theme' | 'advanced' = 'pool') {
  window.history.replaceState(null, '', `/pool/p-a?settings=${tab}`);
  return render(
    <InputSheetProvider>
      <ShellDataProvider value={{ categories: [] }}>
        <PoolSettingsSheet view={of} me="u-me" />
      </ShellDataProvider>
    </InputSheetProvider>,
  );
}

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

describe('renaming the pool in settings (0021, 0059)', () => {
  it('is offered to its creator, shows at once, and saves trimmed', async () => {
    const { container } = settings(view('u-me'), 'pool');
    const save = container.querySelector<HTMLButtonElement>('[data-save-name]')!;
    expect(save.disabled).toBe(true);
    const field = within(container).getByLabelText('Pool name') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '  Sarang  ' } });
    fireEvent.click(save);
    expect(field.value).toContain('Sarang');
    await waitFor(() => expect(renamed).toEqual([['p-a', 'Sarang']]));
  });

  it('is any current member’s too, not only its creator’s (0059)', async () => {
    const { container } = settings(view('u-other'), 'pool');
    expect(container.querySelector('[data-settings-name]')).not.toBeNull();
    fireEvent.change(within(container).getByLabelText('Pool name'), { target: { value: 'Ours' } });
    fireEvent.click(container.querySelector('[data-save-name]')!);
    await waitFor(() => expect(renamed).toEqual([['p-a', 'Ours']]));
  });

  it('keeps notifications out of every tab: they are the bell’s (0059)', () => {
    for (const tab of ['pool', 'theme', 'advanced'] as const) {
      const { container, unmount } = settings(view('u-me'), tab);
      expect(container.ownerDocument.querySelector('[data-settings-notifications]')).toBeNull();
      expect(container.ownerDocument.querySelector('[data-notification-choice]')).toBeNull();
      unmount();
    }
  });
});

describe('inviting everyone to new posts by default (0033)', () => {
  const toggle = (root: HTMLElement) =>
    root.querySelector('[data-settings-invite-all] [role="switch"]') as HTMLButtonElement;

  it('starts as the pool has it, and saves a flip at once', async () => {
    const { container } = settings(view('u-other'), 'pool');
    expect(container.textContent).toContain('Invite everyone to new posts by default');
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', true]]));
  });

  it('turns off a pool that has it on', async () => {
    const { container } = settings(view('u-me', true), 'pool');
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', false]]));
  });
});

describe('Connect your lanes, under Advanced (0033)', () => {
  it('stays folded until Advanced is opened', () => {
    const { container } = settings(view('u-me'), 'advanced');
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
    const { container } = settings(view('u-other'), 'pool');
    const toggle = container.querySelector('[data-settings-on-home] [role="switch"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onHome).toEqual([['p-a', false]]);
  });

  it('offers a member Leave Pool where the creator has Delete Pool', () => {
    const member = settings(view('u-other'), 'advanced');
    expect(member.container.querySelector('[data-delete-pool]')).toBeNull();
    fireEvent.click(member.container.querySelector('[data-settings-leave-pool]')!);
    expect(member.getByText('Keep your records in this Pool?')).toBeTruthy();
    member.unmount();
    const creator = settings(view('u-me'), 'advanced');
    expect(creator.container.querySelector('[data-delete-pool]')).not.toBeNull();
    expect(creator.container.querySelector('[data-settings-leave-pool]')).toBeNull();
  });
});

/** The bell's settings sheet in a pool (0059), its rows read in. */
async function notifications(
  isCreator: boolean,
  prefs: Record<string, unknown> = { poolDefaults: {}, mine: {}, paused: false },
) {
  poolPrefs.next = prefs;
  const view = render(
    <NotificationSettingsSheet
      place={{ poolId: 'p-a', name: 'Our Pool', isCreator }}
      onClose={() => {}}
    />,
  );
  await waitFor(() =>
    expect(view.container.querySelector('[data-notification-choice]')).not.toBeNull(),
  );
  return view;
}

describe('notification settings, from the bell in a pool (H32, 0059)', () => {
  it('starts every type of mine on Use pool default, naming the pool’s value', async () => {
    const { container } = await notifications(false, {
      poolDefaults: { reply: 'off' },
      mine: {},
      paused: false,
    });
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
    const { container } = await notifications(false);
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
    const { container } = await notifications(true);
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
