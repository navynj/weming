// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
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
});

const SUMMARY = {
  id: 's-joint',
  title: 'Arnak league',
  ghostTitle: null,
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

describe('the edit pencil (review)', () => {
  it('shows only where I can edit', () => {
    const card = placeCard(SUMMARY, '', 'UTC');
    const menu = (editable: boolean) =>
      render(
        <InputSheetProvider>
          <CardMenu
            card={{ ...card, editable }}
            pinned={false}
            onPin={() => {}}
            onDelete={() => {}}
          />
        </InputSheetProvider>,
      );
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
            links: [],
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
  links: [],
  pools: [{ id: 'p-ours', name: 'Our Pool', lanes: OUR_LANES }],
  initials: 'YL',
};

async function open(state: Record<string, unknown>) {
  loaded.state = { ...JOINT, ...state };
  const view = render(
    <InputSheetProvider>
      <SplashEditSheet splashId="s-1" context={CONTEXT} onClose={() => {}} />
    </InputSheetProvider>,
  );
  await waitFor(() => expect(view.container.querySelector('[data-edit-form]')).not.toBeNull());
  return view;
}

const save = async (view: ReturnType<typeof render>) => {
  await act(async () => {
    fireEvent.click(view.container.querySelector('[data-edit-save]')!);
  });
};

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

describe('a joint record’s pool lane in the edit sheet (0020)', () => {
  it('offers only its pool’s lanes, and saves a move', async () => {
    const view = await open({});
    const lanes = view.container.querySelector('[data-edit-pool-lanes]')!;
    expect(lanes.textContent).toContain('Games');
    expect(lanes.textContent).toContain('Media');
    fireEvent.click(view.getByText('Media'));
    await save(view);
    expect(saved[0]).toMatchObject({
      kind: 'joint',
      conversion: { op: 'move_pool', poolLaneId: 'l-media' },
    });
  });

  it('sends no move when the lane is unchanged', async () => {
    const view = await open({});
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
      <InputSheetProvider>
        <SplashEditSheet splashId="s-joint" context={CONTEXT} onClose={() => {}} />
        <Probe />
      </InputSheetProvider>,
    );
    await waitFor(() => expect(view.container.querySelector('[data-edit-form]')).not.toBeNull());
    fireEvent.click(view.getByText('Media'));
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
      { id: 'l-games', name: 'Games', icon: '🎲', homeLaneId: 'c-games' },
      { id: 'l-media', name: 'Media', icon: '🎬', homeLaneId: null },
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
      { id: 'p-ours', name: 'Our Pool', lanes: OUR_LANES },
      { id: 'p-other', name: 'Other Pool', lanes: [{ id: 'o-play', name: 'Play', icon: '🃏' }] },
    ],
    links: [
      // Games is linked to Our Pool's Games, as its default, sharing nothing by default.
      {
        myCategoryId: 'c-games',
        poolId: 'p-ours',
        poolName: 'Our Pool',
        poolLaneId: 'l-games',
        isDefault: true,
        shareByDefault: false,
        isHome: true,
      },
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
    view.container.querySelector('[data-together-everyone]') as HTMLButtonElement;
  const hint = (view: ReturnType<typeof render>) =>
    view.container.querySelector('[data-landing-hint]')!.textContent;
  const warnings = (view: ReturnType<typeof render>) =>
    [...view.container.querySelectorAll('[data-edit-warning]')].map((w) => w.textContent);

  it('from a pool: picking a face in Together asks first, lists the other pools, then makes it joint at once', async () => {
    const view = await sheet(MINE_SHARED, SCOPE);
    // No Just mine switch: with nobody picked it stays as it is.
    expect(view.queryByRole('switch', { name: 'Just mine' })).toBeNull();
    // My own face is never offered.
    expect(face(view, 'me')).toBeNull();
    expect(hint(view)).toBe('Yours · in Our Pool');
    fireEvent.click(face(view, 'u-mina'));
    expect(hint(view)).toBe('Together with Mina');
    fireEvent.click(view.container.querySelector('[data-edit-save]')!);
    const confirm = view.container.querySelector('[data-joint-confirm]')!;
    expect(confirm.textContent).toContain(
      'Make this a joint splash in Our Pool? Everyone in Our Pool can add to it and edit its title. You keep your ripples.',
    );
    expect(confirm.textContent).toContain('It will be removed from Other Pool.');
    expect(saved).toHaveLength(0);
    await act(async () => {
      fireEvent.click(view.container.querySelector('[data-joint-confirm-go]')!);
    });
    expect(saved[0]).toMatchObject({
      conversion: { op: 'to_joint', poolLaneId: 'l-games', invitees: ['u-mina'], everyone: false },
    });
    const pending = JSON.parse(view.container.querySelector('[data-pending]')!.textContent!);
    expect(pending['s-1']).toMatchObject({ kind: 'joint', poolLane: { id: 'l-games' } });
  });

  it('from a pool: Everyone makes my pool record joint with everyone', async () => {
    const view = await sheet(
      { ...MINE_SHARED, kind: 'own', poolId: 'p-ours', poolLaneId: 'l-media', sharedIn: [] },
      SCOPE,
    );
    fireEvent.click(everyone(view));
    expect(everyone(view).getAttribute('aria-pressed')).toBe('true');
    expect(face(view, 'u-mina').getAttribute('aria-pressed')).toBe('true');
    expect(face(view, 'u-jae').getAttribute('aria-pressed')).toBe('true');
    expect(hint(view)).toBe('Together with everyone');
    fireEvent.click(view.container.querySelector('[data-edit-save]')!);
    // Nothing else to leave: the confirm names no other pool.
    expect(view.container.querySelector('[data-joint-removed]')).toBeNull();
    await act(async () => {
      fireEvent.click(view.container.querySelector('[data-joint-confirm-go]')!);
    });
    expect(saved[0]).toMatchObject({
      conversion: { op: 'to_joint', poolLaneId: 'l-media', invitees: [], everyone: true },
    });
  });

  it('from a pool: with nobody picked, moves my pool record among the pool lanes', async () => {
    const view = await sheet(
      { ...MINE_SHARED, kind: 'own', poolId: 'p-ours', poolLaneId: 'l-media', sharedIn: [] },
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
    expect(everyone(view).getAttribute('aria-pressed')).toBe('true');
    expect(everyone(view).disabled).toBe(true);
    expect(face(view, 'u-jae').disabled).toBe(true);
  });

  it('from a pool: a joint record someone else wrote in has no Make it mine', async () => {
    const view = await sheet({ othersWrote: true }, SCOPE);
    expect(view.container.querySelector('[data-make-mine]')).toBeNull();
  });

  it('from a pool: Make it mine turns a joint record only I wrote in into my pool record', async () => {
    const view = await sheet({ othersWrote: false, invitees: ['u-mina'] }, SCOPE);
    expect(view.container.querySelector('[data-make-mine]')).not.toBeNull();
    fireEvent.click(view.getByRole('switch', { name: 'Make it mine' }));
    // Together is locked, its faces shown off.
    expect(hint(view)).toBe('Yours · in Our Pool');
    expect(face(view, 'u-mina').disabled).toBe(true);
    expect(face(view, 'u-mina').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="l-media"]')!);
    await save(view);
    expect(saved[0]).toMatchObject({
      invite: [],
      inviteEveryone: false,
      conversion: { op: 'to_pool_record', poolLaneId: 'l-media' },
    });
    const pending = JSON.parse(view.container.querySelector('[data-pending]')!.textContent!);
    expect(pending['s-1']).toMatchObject({ kind: 'own', poolLane: { id: 'l-media' } });
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

  it('from Home: turning a pool on in Audience starts on the link’s default pool lane', async () => {
    const view = await sheet({ ...MINE_SHARED, shared: [], sharedIn: [] }, null);
    const chip = view.container.querySelector('[data-audience-chip]') as HTMLButtonElement;
    expect(chip.textContent).toBe('Only me');
    fireEvent.click(chip);
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Our Pool' }));
    expect(
      view.container.querySelector('[data-audience-lane="l-games"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(chip.textContent).toBe('Our Pool · 🎲 Games');
    await save(view);
    expect(saved[0]).toMatchObject({
      conversion: { op: 'none' },
      share: [{ poolId: 'p-ours', on: true, poolLaneId: 'l-games' }],
    });
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

  it('from Home: a joint record only I wrote in becomes mine in the lane I pick, still shared', async () => {
    const view = await sheet({ othersWrote: false }, null);
    expect(view.container.querySelector('[data-edit-pool-lanes]')).toBeNull();
    // A joint record has no Audience: it belongs to its pool.
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
    fireEvent.click(view.getByText('Games'));
    expect(warnings(view)).toEqual([
      'This is a joint splash in Our Pool. Moving it to your lane makes it yours alone; members can no longer add to it.',
      'It stays shared to Our Pool.',
    ]);
    await save(view);
    expect(saved[0]).toMatchObject({
      conversion: { op: 'to_mine', myLaneId: 'c-games', placeOn: null },
    });
  });

  it('from Home: my pool record moves to the lane I pick, staying shared to its pool', async () => {
    const view = await sheet(
      { ...MINE_SHARED, kind: 'own', poolId: 'p-ours', poolLaneId: 'l-media', sharedIn: [] },
      null,
    );
    expect(view.container.querySelector('[data-edit-just-mine]')!.textContent).toBe(
      'Yours · in Our Pool. Pick a lane to move it to Home.',
    );
    fireEvent.click(view.getByText('Day'));
    expect(warnings(view)).toEqual(['It stays shared to Our Pool.']);
    await save(view);
    expect(saved[0]).toMatchObject({
      kind: 'own',
      conversion: { op: 'to_mine', myLaneId: 'c-day', placeOn: null },
    });
  });

  it('from Home: a joint record someone else wrote in shows only its pool’s lanes and says why', async () => {
    const view = await sheet({ othersWrote: true }, null);
    expect(view.container.querySelector('[data-edit-my-lanes]')).toBeNull();
    expect(view.container.querySelector('[data-edit-pool-lanes]')!.textContent).toContain(
      'Others have written here, so it stays in Our Pool.',
    );
  });
});
