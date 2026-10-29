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
const laneWrites: unknown[] = [];
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
  savePoolLane: (input: { id: string | null }) => {
    laneWrites.push(['save', input]);
    return Promise.resolve({ ok: true, id: input.id ?? 'l-new' });
  },
  reorderPoolLanes: (poolId: string, ids: string[]) => {
    laneWrites.push(['reorder', poolId, ids]);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/lanes/actions', () => ({ saveLane: () => Promise.resolve({ ok: true }) }));
const prefs: [string, unknown][] = [];
const poolPrefs = vi.hoisted(() => ({
  next: { poolDefaults: {}, mine: {}, paused: false } as Record<string, unknown>,
  home: [] as unknown[],
}));
vi.mock('@/features/notifications/actions', () => ({
  loadPoolNotificationPrefs: () => Promise.resolve(poolPrefs.next),
  loadMyPoolsNotificationPrefs: () => Promise.resolve(poolPrefs.home),
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
  laneWrites.length = 0;
});

const view = (ownerId: string, inviteAllByDefault = false): PoolView => ({
  pool: { id: 'p-a', name: 'Our Pool', ownerId, inviteAllByDefault },
  members: [],
  lanes: [],
  placements: [],
  splashes: [],
  ripples: [],
  invites: [],
});

describe('the heading of the pool’s settings', () => {
  it('ends in a small Log out that posts to the sign-out route', () => {
    const { container } = settings(view('u-me'), 'pool');
    const out = container.ownerDocument.querySelector('[data-sign-out]')!;
    expect(out.textContent).toBe('Log out');
    const form = out.closest('form')!;
    expect(form.getAttribute('action')).toBe('/auth/sign-out');
    expect(form.getAttribute('method')).toBe('post');
    // On the title's own line.
    expect(form.parentElement?.querySelector('h2')?.textContent).toBe('Pool settings');
  });
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
    const { container } = settings(view('u-other'), 'advanced');
    expect(container.textContent).toContain('Invite everyone to new posts by default');
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', true]]));
  });

  it('turns off a pool that has it on', async () => {
    const { container } = settings(view('u-me', true), 'advanced');
    expect(toggle(container).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle(container));
    expect(toggle(container).getAttribute('aria-checked')).toBe('false');
    await waitFor(() => expect(invitedAll).toEqual([['p-a', false]]));
  });
});

describe('Connect your lanes, hidden from Advanced (H44)', () => {
  it('is not offered, for the creator or a member; Advanced keeps its switches and Leave', () => {
    for (const owner of ['u-me', 'u-other']) {
      const { container, unmount } = settings(view(owner), 'advanced');
      expect(container.querySelector('[data-settings-advanced-toggle]')).toBeNull();
      expect(container.querySelector('[data-settings-advanced], [data-lane-match]')).toBeNull();
      expect(container.textContent).not.toContain('Connect your lanes');
      expect(container.querySelector('[data-settings-on-home]')).not.toBeNull();
      expect(container.querySelector('[data-settings-invite-all]')).not.toBeNull();
      unmount();
    }
  });
});

describe('my own settings for a pool (0039)', () => {
  it('keeps what I wrote here off my Home with one switch, on by default', () => {
    const { container } = settings(view('u-other'), 'advanced');
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
    // Mine first; the defaults behind their own tab (review).
    expect(
      container.querySelector('[data-notification-group="mine"]')!.getAttribute('aria-selected'),
    ).toBe('true');
    expect(container.querySelector('[data-default]')).toBeNull();
    const all = container.querySelector<HTMLButtonElement>(
      '[data-notification-choice="mine-new_post-all"]',
    )!;
    fireEvent.click(all);
    expect(all.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() =>
      expect(prefs).toEqual([['mine', { poolId: 'p-a', type: 'new_post', value: 'all' }]]),
    );
  });

  it('shows a member the defaults read-only, under their tab', async () => {
    const { container } = await notifications(false);
    fireEvent.click(container.querySelector('[data-notification-group="defaults"]')!);
    expect(container.querySelector('[data-notification-choice^="default-"]')).toBeNull();
    expect(container.querySelector('[data-default="new_post"]')!.textContent).toContain(
      'Only when I’m invited',
    );
  });

  it('lets the creator set the defaults for members', async () => {
    const { container } = await notifications(true);
    fireEvent.click(container.querySelector('[data-notification-group="defaults"]')!);
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

describe('the pool settings sheet’s shape (review)', () => {
  it('has underline tabs, the Pool tab in two columns on a desktop, the switches under Advanced', () => {
    const pool = settings(view('u-me'), 'pool');
    const tab = (key: string) =>
      pool.container.querySelector<HTMLElement>(`[data-settings-tab="${key}"]`)!;
    expect(tab('pool').getAttribute('role')).toBe('tab');
    expect(tab('pool').getAttribute('aria-selected')).toBe('true');
    expect(tab('pool').className).toContain('text-ink');
    expect(tab('pool').querySelector('.bg-ink')).not.toBeNull();
    expect(tab('theme').className).toContain('text-pool-500');
    // Photo and name narrow at the left, the lanes wide at the right.
    const columns = pool.container.querySelector<HTMLElement>('[data-settings-pool]')!;
    expect(columns.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]');
    expect(
      [...columns.children].map((c) =>
        c.hasAttribute('data-settings-name')
          ? 'name'
          : c.hasAttribute('data-settings-lanes')
            ? 'lanes'
            : '?',
      ),
    ).toEqual(['name', 'lanes']);
    expect(pool.container.querySelector('[data-settings-on-home]')).toBeNull();
    pool.unmount();
    const advanced = settings(view('u-me'), 'advanced');
    const order = [
      ...advanced.container.querySelectorAll(
        '[data-settings-on-home], [data-settings-invite-all], [data-settings-advanced]',
      ),
    ].map((el) =>
      el.hasAttribute('data-settings-on-home')
        ? 'on-home'
        : el.hasAttribute('data-settings-invite-all')
          ? 'invite-all'
          : 'connect',
    );
    // Connect your lanes is hidden for now (H44).
    expect(order).toEqual(['on-home', 'invite-all']);
  });
});

describe('the pool’s lanes are Home’s lane rows (H42b)', () => {
  const lane = (id: string, name: string, position: number) => ({
    id,
    pool_id: 'p-a',
    name,
    icon: '🌊',
    description: null,
    position,
  });
  const withLanes = (ownerId: string): PoolView => ({
    ...view(ownerId),
    lanes: [lane('l-a', 'Work', 0), lane('l-b', 'Play', 1)],
  });

  it('reorders by the grip, for any current member, saved as one order at once', async () => {
    const { container } = settings(withLanes('u-other'), 'pool');
    const editor = container.querySelector('[data-pool-lanes-editor]')!;
    expect(editor.querySelectorAll('[data-lane-grip]')).toHaveLength(2);
    // No Delete: a pool lane's waits for roles.
    expect(within(editor as HTMLElement).queryByLabelText(/^Delete/)).toBeNull();
    fireEvent.keyDown(within(editor as HTMLElement).getByLabelText('Move Play'), {
      key: 'ArrowUp',
    });
    expect(
      [...editor.querySelectorAll('[data-lane-row]')].map((r) => r.getAttribute('data-lane-row')),
    ).toEqual(['l-b', 'l-a']);
    // No Save: the move is the write.
    expect(editor.querySelector('[data-lanes-save]')).toBeNull();
    await waitFor(() => expect(laneWrites).toEqual([['reorder', 'p-a', ['l-b', 'l-a']]]));
  });

  it('saves each row as it is left, a new one then ordered by the id it is given', async () => {
    const { container } = settings(withLanes('u-me'), 'pool');
    const editor = container.querySelector('[data-pool-lanes-editor]') as HTMLElement;
    fireEvent.click(editor.querySelector('[data-add-lane]')!);
    const names = within(editor).getAllByLabelText('Lane name') as HTMLInputElement[];
    expect(names).toHaveLength(3);
    const description = within(editor).getAllByLabelText('Lane description')[0]!;
    fireEvent.change(description, { target: { value: 'Office days' } });
    fireEvent.blur(description);
    await waitFor(() =>
      expect(laneWrites).toEqual([
        [
          'save',
          { id: 'l-a', poolId: 'p-a', name: 'Work', icon: '🌊', description: 'Office days' },
        ],
      ]),
    );
    fireEvent.change(names[2]!, { target: { value: '  Trips ' } });
    fireEvent.blur(names[2]!);
    await waitFor(() =>
      expect(laneWrites.slice(1)).toEqual([
        ['save', { id: null, poolId: 'p-a', name: 'Trips', icon: null, description: null }],
        ['reorder', 'p-a', ['l-a', 'l-b', 'l-new']],
      ]),
    );
  });
});

describe('notification settings, from the bell on Home (H42h)', () => {
  const prefs = (mine: Record<string, string>) => ({ poolDefaults: {}, mine, paused: false });

  it('picks a pool by underline tabs, the first chosen, one pool’s notifications shown at a time', async () => {
    poolPrefs.home = [
      { poolId: 'p-a', name: 'Our Pool', prefs: prefs({ reply: 'off' }) },
      { poolId: 'p-b', name: 'Study Crew', prefs: prefs({}) },
    ];
    const { container } = render(<NotificationSettingsSheet place={null} onClose={() => {}} />);
    await waitFor(() =>
      expect(container.querySelector('[data-notification-pools]')).not.toBeNull(),
    );
    const tab = (id: string) =>
      container.querySelector<HTMLButtonElement>(`[data-notification-pool="${id}"]`)!;
    expect(tab('p-a').getAttribute('role')).toBe('tab');
    expect(tab('p-a').textContent).toBe('Our Pool');
    expect(tab('p-a').getAttribute('aria-selected')).toBe('true');
    expect(tab('p-b').getAttribute('aria-selected')).toBe('false');
    const group = (id: string) =>
      container.querySelector(`[data-settings-notifications="${id}"]`)!.parentElement!;
    expect(group('p-a').hidden).toBe(false);
    expect(group('p-b').hidden).toBe(true);
    // The tab names the pool: no heading of its own, and no members' defaults.
    expect(group('p-a').querySelector('h2')).toBeNull();
    expect(container.querySelector('[data-notification-group]')).toBeNull();

    fireEvent.click(tab('p-b'));
    expect(tab('p-b').getAttribute('aria-selected')).toBe('true');
    expect(group('p-a').hidden).toBe(true);
    expect(group('p-b').hidden).toBe(false);
    poolPrefs.home = [];
  });
});
