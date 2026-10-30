// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
const saved: Record<string, unknown>[] = [];
/** Our Pool's lanes, as the Audience sheet and a joint record's own lanes show them. */
const OUR_LANES = [
  { id: 'l-games', name: 'Games', icon: '🎲' },
  { id: 'l-media', name: 'Media', icon: '🎬' },
];
const JOINT = {
  ok: true,
  kind: 'joint',
  title: 'Arnak league',
  icon: '🏛️',
  declaredStart: null,
  declaredEnd: null,
  declaredLaneId: null,
  shared: [],
  poolId: 'p-ours',
  annotation: null,
  poolLanes: OUR_LANES,
  poolLaneId: 'l-games',
  sharedIn: [],
  // Mina wrote here too: from Home it stays among its pool's lanes (0022).
  othersWrote: true,
  invitees: [],
  inviteAll: false,
  isMaker: false,
  writerIds: ['me', 'u-mina'],
  laneNames: {
    'l-games': { name: 'Games', icon: '🎲', poolId: 'p-ours' },
    'l-media': { name: 'Media', icon: '🎬', poolId: 'p-ours' },
  },
};
const loaded = vi.hoisted(() => ({ state: null as unknown }));
/** What the next save resolves to; unset is a plain success. */
const outcome = vi.hoisted(() => ({
  next: null as Promise<{ ok: true } | { ok: false; message: string }> | null,
}));
const filed = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/features/home/filing-actions', () => ({
  fileOnHome: (...args: unknown[]) => {
    filed.push(args);
    return Promise.resolve({ ok: true });
  },
}));
vi.mock('@/features/splash-sheet/edit-actions', () => ({
  loadSplashEdit: () => Promise.resolve(loaded.state ?? JOINT),
  saveSplashEdit: (input: Record<string, unknown>) => {
    saved.push(input);
    return outcome.next ?? Promise.resolve({ ok: true });
  },
}));

import { CardMenu } from '@/features/home/card-menu';
import { placeCard } from '@/features/home/grid';
import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import type { PoolScope } from '@/features/pool/compose-scope';
import { SplashEditSheet } from '@/features/splash-sheet/splash-edit-sheet';
import type { SplashSummary } from '@/features/splash/summary';

afterEach(() => {
  cleanup();
  loaded.state = null;
  outcome.next = null;
  saved.length = 0;
  filed.length = 0;
  // The last Audience pick on this device (0033): kept apart between tests.
  window.localStorage.clear();
});

const SUMMARY = {
  id: 's-joint',
  title: 'Arnak league',
  ghostTitle: null,
  description: null,
  declaredLaneId: null,
  icon: '🏛️',
  laneIds: [],
  declaredRange: null,
  range: { start: '2026-10-22', end: '2026-10-22' },
  count: 1,
  blocks: [],
  latestCreatedAt: '2026-10-22T18:00:00Z',
  writtenOn: '2026-10-22',
  ownPoolId: null,
  open: true,
  createdAt: '2026-10-22T18:00:00Z',
  pinnedAt: null,
  sessionId: null,
  orphan: false,
} satisfies SplashSummary;

describe('the card menu’s Edit (review)', () => {
  it('shows only where I can edit', () => {
    const card = placeCard(SUMMARY, '', 'UTC');
    const menu = (editable: boolean) => {
      const view = render(
        <InputSheetProvider>
          <CardMenu
            card={{ ...card, editable }}
            pinned={false}
            onPin={() => {}}
            onDelete={() => {}}
          />
        </InputSheetProvider>,
      );
      fireEvent.click(view.container.querySelector('[data-card-menu-button]')!);
      return view;
    };
    expect(menu(true).container.querySelector('[data-card-edit]')).not.toBeNull();
    cleanup();
    expect(menu(false).container.querySelector('[data-card-edit]')).toBeNull();
  });
});

function Probe() {
  const { pendingEdits, dropMessage } = useInputSheet();
  return (
    <>
      <span data-pending>{JSON.stringify(pendingEdits)}</span>
      <span data-drop-message>{dropMessage ?? ''}</span>
    </>
  );
}

describe('editing a joint record (review)', () => {
  it('offers title and icon only, saves them, and shows them at once', async () => {
    const view = render(
      <InputSheetProvider>
        <SplashEditSheet
          splashId="s-joint"
          context={{
            categories: [],
            timeZone: 'UTC',
            today: '2026-10-23',
            pools: [{ id: 'p-ours', name: 'Our Pool', lanes: OUR_LANES }],
            initials: 'YL',
          }}
          onClose={() => {}}
        />
        <Probe />
      </InputSheetProvider>,
    );
    await waitFor(() =>
      expect(view.container.querySelector('[data-edit-form="joint"]')).not.toBeNull(),
    );
    // No dates, no lane, no audience on a joint splash.
    expect(view.container.querySelector('[data-edit-date]')).toBeNull();
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
    const save = view.container.querySelector('[data-edit-save]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Arnak finals' } });
    expect(save.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(save);
    });
    expect(saved[0]).toMatchObject({
      id: 's-joint',
      kind: 'joint',
      title: 'Arnak finals',
      icon: '🏛️',
    });
    expect(view.container.querySelector('[data-pending]')!.textContent).toContain('Arnak finals');
  });
});

const CONTEXT = {
  categories: [],
  timeZone: 'America/Vancouver',
  today: '2026-10-23',
  pools: [{ id: 'p-ours', name: 'Our Pool', lanes: OUR_LANES }],
  initials: 'YL',
};

/** Our Pool, as its screen opens the sheet: a joint record moves among its lanes there. */
const OURS: PoolScope = {
  poolId: 'p-ours',
  poolName: 'Our Pool',
  lanes: OUR_LANES,
  members: [{ id: 'me', name: 'Yoonji', initials: 'YL' }],
};

async function open(state: Record<string, unknown>, pool: PoolScope | null = null) {
  loaded.state = { ...JOINT, ...state };
  const view = render(
    <PeopleProvider me="me" people={{}}>
      <InputSheetProvider>
        <SplashEditSheet splashId="s-1" context={CONTEXT} pool={pool} onClose={() => {}} />
      </InputSheetProvider>
    </PeopleProvider>,
  );
  await waitFor(() => expect(view.container.querySelector('[data-edit-form]')).not.toBeNull());
  return view;
}

const save = async (view: ReturnType<typeof render>) => {
  await act(async () => {
    fireEvent.click(view.container.querySelector('[data-edit-save]')!);
  });
};

describe('no description in the edit sheet (H48)', () => {
  it('has no description field or "+ Add description", even on one that has words', async () => {
    const view = await open({
      kind: 'mine',
      title: 'Coffee',
      description: 'Kept on the page',
      declaredStart: '2026-10-20',
      annotation: { date: '2026-10-20', time: null, endDate: null, endTime: null },
    });
    expect(view.queryByLabelText('Description')).toBeNull();
    expect(view.container.textContent).not.toContain('Add description');
    // Saving a title sends nothing about it, so the page's stays as it is.
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Coffee, again' } });
    await save(view);
    expect(saved[0]).not.toHaveProperty('description');
  });
});

describe('a splash’s date in the edit sheet (review)', () => {
  it('edits the post’s own days, with no clock: never a ripple’s date (H24)', async () => {
    const view = await open({
      kind: 'mine',
      title: 'Coffee',
      declaredStart: '2026-10-20',
      annotation: { date: '2026-10-20', time: null, endDate: null, endTime: null },
    });
    expect((view.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-20');
    expect(view.queryByLabelText('Time')).toBeNull();
    expect((view.container.querySelector('[data-edit-save]') as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-10-21' } });
    await save(view);
    expect(saved[0]).toMatchObject({ declaredStart: '2026-10-21', declaredEnd: null });
    expect(saved[0]).not.toHaveProperty('block');
  });

  it('opens a declared range as its days, with no clock, and saves the declaration', async () => {
    const view = await open({
      kind: 'mine',
      title: 'Whistler',
      declaredStart: '2026-10-10',
      declaredEnd: '2026-10-12',
      annotation: { date: '2026-10-10', time: null, endDate: '2026-10-12', endTime: null },
    });
    expect((view.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-10-10');
    expect((view.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-10-12');
    expect(view.queryByText('+ add time')).toBeNull();
    fireEvent.change(view.getByLabelText('End date'), { target: { value: '2026-10-13' } });
    await save(view);
    expect(saved[0]).toMatchObject({
      declaredStart: '2026-10-10',
      declaredEnd: '2026-10-13',
    });
  });
});

describe('a joint record’s pool lane in the edit sheet, from its pool (0020)', () => {
  it('offers only its pool’s lanes, and saves a move', async () => {
    const view = await open({}, OURS);
    const lanes = view.container.querySelector('[data-edit-pool-lanes]')!;
    expect(lanes.textContent).toContain('Games');
    expect(lanes.textContent).toContain('Media');
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="l-media"]')!);
    await save(view);
    expect(saved[0]).toMatchObject({
      kind: 'joint',
      conversion: { op: 'move_pool', poolLaneId: 'l-media' },
    });
  });

  it('sends no move when the lane is unchanged', async () => {
    const view = await open({}, OURS);
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Renamed' } });
    await save(view);
    expect(saved[0]).toMatchObject({ conversion: { op: 'none' } });
  });

  it('keeps my own lane chips, not the pool’s, for my Home record shared to a pool', async () => {
    const view = await open({ kind: 'mine', poolLanes: [], poolLaneId: null });
    expect(view.container.querySelector('[data-edit-pool-lanes]')).toBeNull();
  });
});

describe('a pool-lane move from the edit sheet (review)', () => {
  async function moveTo(result: { ok: true } | { ok: false; message: string }) {
    let settle!: (value: typeof result) => void;
    outcome.next = new Promise((resolve) => (settle = resolve));
    loaded.state = { ...JOINT };
    const view = render(
      <PeopleProvider me="me" people={{}}>
        <InputSheetProvider>
          <SplashEditSheet splashId="s-joint" context={CONTEXT} pool={OURS} onClose={() => {}} />
          <Probe />
        </InputSheetProvider>
      </PeopleProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('[data-edit-form]')).not.toBeNull());
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="l-media"]')!);
    await act(async () => {
      fireEvent.click(view.container.querySelector('[data-edit-save]')!);
    });
    const pending = () =>
      JSON.parse(view.container.querySelector('[data-pending]')!.textContent!) as Record<
        string,
        { poolLane?: { id: string } }
      >;
    // Shown before the server answers.
    expect(pending()['s-joint']?.poolLane?.id).toBe('l-media');
    await act(async () => settle(result));
    return { view, pending };
  }

  it('shows the move before the save returns', async () => {
    await moveTo({ ok: true });
  });

  it('takes the move back and says why when the save is refused', async () => {
    const { view, pending } = await moveTo({ ok: false, message: 'that lane is not in this pool' });
    expect(pending()['s-joint']).toBeUndefined();
    expect(view.container.querySelector('[data-drop-message]')!.textContent).toBe(
      'that lane is not in this pool',
    );
  });
});

describe('converting from the edit sheet (0022, 0033)', () => {
  const SCOPE: PoolScope = {
    poolId: 'p-ours',
    poolName: 'Our Pool',
    lanes: [
      { id: 'l-games', name: 'Games', icon: '🎲' },
      { id: 'l-media', name: 'Media', icon: '🎬' },
    ],
    members: [
      { id: 'me', name: 'Yoonji', initials: 'YL' },
      { id: 'u-mina', name: 'Mina', initials: 'MK' },
      { id: 'u-jae', name: 'Jae', initials: 'JP' },
    ],
  };
  const MINE_SHARED = {
    kind: 'mine',
    title: 'Arnak night',
    declaredLaneId: 'c-games',
    shared: ['p-ours', 'p-other'],
    sharedIn: [
      { poolId: 'p-ours', poolLaneId: 'l-games' },
      { poolId: 'p-other', poolLaneId: 'o-play' },
    ],
    poolId: null,
    poolLanes: [],
    poolLaneId: null,
    othersWrote: false,
    laneNames: {
      'l-games': { name: 'Games', icon: '🎲', poolId: 'p-ours' },
      'o-play': { name: 'Play', icon: '🃏', poolId: 'p-other' },
    },
  };
  const CTX = {
    ...CONTEXT,
    categories: [
      { id: 'c-games', name: 'Games', icon: '🎲' },
      { id: 'c-day', name: 'Day', icon: '🖋' },
    ],
    pools: [
      {
        id: 'p-ours',
        name: 'Our Pool',
        lanes: OUR_LANES,
        members: [{ id: 'u-mina', name: 'Mina', initials: 'MI' }],
      },
      { id: 'p-other', name: 'Other Pool', lanes: [{ id: 'o-play', name: 'Play', icon: '🃏' }] },
    ],
  } as unknown as typeof CONTEXT;

  async function sheet(state: Record<string, unknown>, pool: PoolScope | null) {
    loaded.state = { ...JOINT, ...state };
    const view = render(
      <PeopleProvider me="me" people={{}}>
        <InputSheetProvider>
          <SplashEditSheet splashId="s-1" context={CTX} pool={pool} onClose={() => {}} />
          <Probe />
        </InputSheetProvider>
      </PeopleProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('[data-edit-form]')).not.toBeNull());
    return view;
  }
  const face = (view: ReturnType<typeof render>, id: string) =>
    view.container.querySelector(`[data-together-face="${id}"]`) as HTMLButtonElement;
  const everyone = (view: ReturnType<typeof render>) =>
    view.container.querySelector('[data-together-everyone] [role="switch"]') as HTMLButtonElement;
  const hint = (view: ReturnType<typeof render>) =>
    view.container.querySelector('[data-landing-hint]')!.textContent;
  const warnings = (view: ReturnType<typeof render>) =>
    [...view.container.querySelectorAll('[data-edit-warning]')].map((w) => w.textContent);

  it('from a pool: my Home record and my pool record show their Audience', async () => {
    const home = await sheet(MINE_SHARED, SCOPE);
    expect(home.container.querySelector('[data-audience-chip]')).not.toBeNull();
    cleanup();
    const own = await sheet(
      {
        ...MINE_SHARED,
        kind: 'own',
        poolId: 'p-ours',
        poolLaneId: 'l-media',
        sharedIn: [],
        ownShared: [{ poolId: 'p-ours', poolLaneId: 'l-media' }],
        ownTogether: { everyone: false, picked: [] },
      },
      SCOPE,
    );
    expect(own.container.querySelector('[data-audience-chip]')).not.toBeNull();
  });

  it('from a pool: my Home record offers no With there; it never becomes joint here', async () => {
    const view = await sheet(MINE_SHARED, SCOPE);
    expect(view.container.querySelector('[data-together]')).toBeNull();
    expect(view.container.querySelector('[data-together-face]')).toBeNull();
  });

  it('from a pool: my pool record’s With sets who may add their side, never joint (0035)', async () => {
    const view = await sheet(
      {
        ...MINE_SHARED,
        kind: 'own',
        poolId: 'p-ours',
        poolLaneId: 'l-media',
        sharedIn: [],
        ownShared: [],
        ownTogether: { everyone: false, picked: [] },
      },
      SCOPE,
    );
    fireEvent.click(face(view, 'u-mina'));
    await save(view);
    expect(saved[0]).toMatchObject({
      conversion: { op: 'none' },
      ownTogether: { everyone: false, picked: ['u-mina'] },
    });
    expect(view.container.querySelector('[data-joint-confirm]')).toBeNull();
  });

  it('from a pool: moving my Home record to another pool lane places it there, nothing more', async () => {
    const view = await sheet(MINE_SHARED, SCOPE);
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="l-media"]')!);
    await save(view);
    expect(saved[0]).toMatchObject({ conversion: { op: 'set_lane', placeOn: 'l-media' } });
    expect(view.container.querySelector('[data-joint-confirm]')).toBeNull();
  });

  it('from a pool: with nobody picked, moves my pool record among the pool lanes', async () => {
    const view = await sheet(
      {
        ...MINE_SHARED,
        kind: 'own',
        poolId: 'p-ours',
        poolLaneId: 'l-media',
        sharedIn: [],
        ownShared: [],
      },
      SCOPE,
    );
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="l-games"]')!);
    await save(view);
    expect(saved[0]).toMatchObject({ conversion: { op: 'move_pool', poolLaneId: 'l-games' } });
    expect(view.container.querySelector('[data-joint-confirm]')).toBeNull();
  });

  it('from a pool: a joint record keeps the faces already invited and adds new ones', async () => {
    const view = await sheet({ othersWrote: true, invitees: ['me', 'u-mina'] }, SCOPE);
    expect(face(view, 'u-mina').getAttribute('aria-pressed')).toBe('true');
    expect(face(view, 'u-mina').disabled).toBe(true);
    expect(face(view, 'u-jae').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(face(view, 'u-jae'));
    expect(hint(view)).toBe('Together with Mina, Jae');
    await save(view);
    expect(saved[0]).toMatchObject({
      kind: 'joint',
      invite: ['u-jae'],
      inviteEveryone: false,
      conversion: { op: 'none' },
    });
  });

  it('from a pool: a joint record with everyone has Everyone fixed on', async () => {
    const view = await sheet({ othersWrote: true, inviteAll: true }, SCOPE);
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
    expect(everyone(view).disabled).toBe(true);
    expect(face(view, 'u-jae').disabled).toBe(true);
  });

  it('from a pool: its maker turns Everyone off and keeps some; a writer taken off is named (0043)', async () => {
    const view = await sheet({ othersWrote: true, inviteAll: true, isMaker: true }, SCOPE);
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
    expect(everyone(view).disabled).toBe(false);
    // Deselecting a face turns Everyone off and keeps the rest.
    fireEvent.click(face(view, 'u-mina'));
    expect(everyone(view).getAttribute('aria-checked')).toBe('false');
    expect(warnings(view).join(' ')).toContain('Mina has written here. What they wrote stays.');
    await save(view);
    expect(saved[0]).toMatchObject({
      kind: 'joint',
      jointTogether: { everyone: false, picked: ['u-jae'] },
      invite: [],
      inviteEveryone: false,
    });
  });

  it('from a pool: its maker takes off someone picked who has not written, with no note', async () => {
    const view = await sheet(
      { othersWrote: true, invitees: ['me', 'u-jae'], isMaker: true },
      SCOPE,
    );
    expect(face(view, 'u-jae').disabled).toBe(false);
    fireEvent.click(face(view, 'u-jae'));
    expect(warnings(view).join(' ')).not.toContain('written here');
    await save(view);
    expect(saved[0]).toMatchObject({ jointTogether: { everyone: false, picked: [] } });
  });

  it('from a pool: a joint record offers no Make it mine — that is done from Home', async () => {
    for (const othersWrote of [true, false]) {
      const view = await sheet({ othersWrote }, SCOPE);
      expect(view.container.querySelector('[data-make-mine]')).toBeNull();
      expect(view.queryByRole('switch', { name: 'Make it mine' })).toBeNull();
      view.unmount();
    }
  });

  it('from Home: changing my shared Home record’s lane says nothing and moves no placement', async () => {
    const view = await sheet(MINE_SHARED, null);
    expect(view.container.querySelector('[data-edit-my-lanes]')).not.toBeNull();
    fireEvent.click(view.getByText('Day'));
    expect(warnings(view)).toEqual([]);
    await save(view);
    expect(saved[0]).toMatchObject({
      conversion: { op: 'set_lane', myLaneId: 'c-day', placeOn: null },
      share: [],
    });
  });

  it('from Home: a pool turned on in Audience shows its With; a face picked is saved with it (0035)', async () => {
    const view = await sheet({ ...MINE_SHARED, shared: [], sharedIn: [] }, null);
    fireEvent.click(view.container.querySelector('[data-audience-chip]')!);
    expect(view.container.querySelector('[data-audience-with]')).toBeNull();
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Our Pool' }));
    // No default lane (H45): With shows once one is picked.
    expect(view.container.querySelector('[data-audience-with="p-ours"]')).toBeNull();
    fireEvent.click(view.container.querySelector('[data-audience-lane="l-games"]')!);
    const line = view.container.querySelector('[data-audience-with="p-ours"]')!;
    expect(line.textContent).toContain('With');
    expect(line.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(line.querySelector('[data-audience-face="u-mina"]')!);
    await save(view);
    expect(saved[0]).toMatchObject({
      share: [
        {
          poolId: 'p-ours',
          on: true,
          poolLaneId: 'l-games',
          together: { everyone: false, picked: ['u-mina'] },
        },
      ],
    });
  });

  it('from Home: turning a pool on in Audience starts on no lane: one is picked (H45)', async () => {
    const view = await sheet({ ...MINE_SHARED, shared: [], sharedIn: [] }, null);
    const chip = view.container.querySelector('[data-audience-chip]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Our Pool' }));
    expect(
      view.container.querySelector('[data-audience-lane="l-games"]')!.getAttribute('aria-pressed'),
    ).toBe('false');
    expect(chip.textContent).toBe('Only me');
  });

  it('from Home: turning a pool off in Audience saves it off', async () => {
    const view = await sheet(MINE_SHARED, null);
    const chip = view.container.querySelector('[data-audience-chip]') as HTMLButtonElement;
    expect(chip.textContent).toBe('2 pools');
    fireEvent.click(chip);
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Other Pool' }));
    expect(chip.textContent).toBe('Our Pool · 🎲 Games');
    await save(view);
    expect(saved[0]).toMatchObject({
      share: [{ poolId: 'p-other', on: false, poolLaneId: null }],
    });
  });

  const chipOf = (view: ReturnType<typeof render>, sel: string) =>
    view.container.querySelector(sel) as HTMLButtonElement;
  const HOME = {
    pool: { id: 'p-ours', name: 'Our Pool', photo: null },
    poolLane: { name: 'Games', icon: '🎲' },
    filed: null,
  };

  it('from Home: a joint record shows its pool’s chip, then my lanes, and files at once (H45)', async () => {
    const view = await sheet({ othersWrote: false, home: HOME, id: 's-1' }, null);
    expect(view.container.querySelector('[data-edit-my-lanes]')).toBeNull();
    expect(view.container.querySelector('[data-edit-pool-lanes]')).toBeNull();
    const pool = chipOf(view, '[data-filing-pool="p-ours"]');
    expect(pool.textContent).toContain('Our Pool');
    expect(pool.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.textContent).not.toMatch(/Make it mine|Move to Home/);
    fireEvent.click(view.getByText('Day'));
    await waitFor(() => expect(filed).toEqual([['s-1', 'c-day']]));
    expect(pool.getAttribute('aria-pressed')).toBe('false');
    // On Home its mark moves at once; nothing to save.
    const pending = JSON.parse(view.container.querySelector('[data-pending]')!.textContent!);
    expect(pending['s-1'].homeColumn).toEqual({
      column: 'c-day',
      lane: { icon: '🖋', name: 'Day' },
    });
    expect(saved).toEqual([]);
    // The pool's chip takes it back.
    fireEvent.click(pool);
    await waitFor(() =>
      expect(filed).toEqual([
        ['s-1', 'c-day'],
        ['s-1', null],
      ]),
    );
  });

  it('from Home: my pool record files on Home, and its Audience keeps its pool locked, Move to Home in its … (H45)', async () => {
    const view = await sheet(
      {
        ...MINE_SHARED,
        kind: 'own',
        id: 's-1',
        poolId: 'p-ours',
        poolLaneId: 'l-media',
        sharedIn: [],
        ownShared: [
          { poolId: 'p-ours', poolLaneId: 'l-media', together: { everyone: false, picked: [] } },
        ],
        home: { ...HOME, filed: 'c-games' },
      },
      null,
    );
    expect(chipOf(view, '[data-filing-pool="p-ours"]').getAttribute('aria-pressed')).toBe('false');
    expect(view.container.querySelector('[data-edit-just-mine]')).toBeNull();
    fireEvent.click(view.container.querySelector('[data-audience-chip]')!);
    expect(view.container.querySelector('[data-audience-origin]')!.textContent).toBe(
      'Written here, always shared',
    );
    const origin = view.getByRole('switch', { name: 'Shared to Our Pool' }) as HTMLButtonElement;
    expect(origin.disabled).toBe(true);
    // Move to Home, from the header's …, starts on the lane I filed it in.
    fireEvent.click(view.container.querySelector('[data-audience-more]')!);
    fireEvent.click(view.container.querySelector('[data-audience-move-home]')!);
    const games = [...view.container.querySelectorAll('[data-move-to-home] button')].find((b) =>
      b.textContent?.includes('Games'),
    )!;
    expect(games.getAttribute('aria-pressed')).toBe('true');
  });

  it('from Home: someone’s record I wrote on offers only where it shows on my Home (H45)', async () => {
    const view = await sheet({ kind: 'theirs', id: 's-1', home: HOME }, null);
    expect(view.container.querySelector('[data-edit-title]')).toBeNull();
    expect(view.container.querySelector('[data-edit-save]')).toBeNull();
    expect(view.container.querySelector('[data-filing-chips]')).not.toBeNull();
    fireEvent.click(view.getByText('Games'));
    await waitFor(() => expect(filed).toEqual([['s-1', 'c-games']]));
  });
});
