// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Make it a joint record of <Pool>…" in the top card's `…` menu: the only
 * way my record becomes joint (Yoonji, in the session). With in the edit
 * sheet never does it. Offered for my record in a pool, and on Home for my
 * pool record; never for a joint record or someone else's.
 */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const actions = vi.hoisted(() => ({
  preview: vi.fn(),
  make: vi.fn(),
}));
vi.mock('@/features/splash-sheet/edit-actions', () => ({
  previewMakeJoint: actions.preview,
  makeJointRecord: actions.make,
}));

import { CardMenu } from '@/features/home/card-menu';
import { placeCard, type Card } from '@/features/home/grid';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { PoolEditScope } from '@/features/pool/edit-scope';
import type { PoolScope } from '@/features/pool/compose-scope';
import { summarizeSplash, type Splash } from '@/features/splash/summary';

import { written } from './written-on';

const ME = 'a1';
const TZ = 'America/Vancouver';
const SCOPE: PoolScope = {
  poolId: 'p-ours',
  poolName: 'Our Pool',
  lanes: [{ id: 'l-games', name: 'Games', icon: '🎲', homeLaneId: null }],
  members: [{ id: ME, name: 'Yoonji', initials: 'YL' }],
};

function splash(over: Partial<Splash> = {}): Splash {
  return written({
    id: 's-1',
    owner_id: ME,
    title: 'Board night',
    declared_start: '2026-10-20',
    declared_end: null,
    declared_lane_id: 'c-day',
    session_id: null,
    icon: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    description: null,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-10-20T16:00:00.000Z',
    ...over,
  });
}

function card(over: Partial<Card> = {}, row: Partial<Splash> = {}): Card {
  const summary = summarizeSplash(splash(row), [], TZ, new Date('2026-10-26T20:00:00Z'));
  return { ...placeCard(summary, 'dice', TZ, []), editable: true, ...over };
}

function menu(c: Card, scope: PoolScope | null = SCOPE) {
  const inner = <CardMenu card={c} pinned={false} onPin={() => {}} onDelete={() => {}} />;
  const view = render(
    <InputSheetProvider>
      {scope ? <PoolEditScope scope={scope}>{inner}</PoolEditScope> : inner}
    </InputSheetProvider>,
  );
  fireEvent.click(view.container.querySelector('[data-card-menu-button]')!);
  return view;
}

beforeEach(() => {
  actions.preview.mockReset();
  actions.make.mockReset();
});
afterEach(cleanup);

describe('Make it a joint record of <Pool>… (the menu)', () => {
  it('is offered for my record in a pool, named after the pool', () => {
    const view = menu(card());
    expect(view.container.querySelector('[data-card-make-joint]')!.textContent).toBe(
      'Make it a joint record of Our Pool…',
    );
  });

  it('is not offered for a joint record, someone else’s, or my Home record on Home', () => {
    for (const [c, scope] of [
      [card({ joint: true }), SCOPE],
      [card({ editable: false }), SCOPE],
      [card(), null],
    ] as const) {
      const view = menu(c, scope);
      expect(view.container.querySelector('[data-card-make-joint]')).toBeNull();
      view.unmount();
    }
  });

  it('is offered on Home for my pool record, named after its pool', () => {
    const view = menu(
      {
        ...card({}, { own_pool_id: 'p-ours', declared_lane_id: null }),
        lane: { icon: '🎲', name: 'Our Pool' },
      },
      null,
    );
    expect(view.container.querySelector('[data-card-make-joint]')!.textContent).toBe(
      'Make it a joint record of Our Pool…',
    );
  });

  it('asks first, naming the pools it leaves, then makes it joint', async () => {
    actions.preview.mockResolvedValue({
      ok: true,
      poolName: 'Our Pool',
      poolLaneId: 'l-games',
      removed: ['Study'],
    });
    actions.make.mockResolvedValue({ ok: true });
    const view = menu(card());
    fireEvent.click(view.container.querySelector('[data-card-make-joint]')!);
    expect(actions.preview).toHaveBeenCalledWith('s-1', 'p-ours');
    await waitFor(() =>
      expect(view.container.querySelector('[data-joint-removed]')!.textContent).toBe(
        'It will be removed from Study.',
      ),
    );
    expect(actions.make).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(view.container.querySelector('[data-joint-confirm-go]')!);
    });
    expect(actions.make).toHaveBeenCalledWith('s-1', 'p-ours');
  });

  it('says why when it cannot, and changes nothing', async () => {
    actions.preview.mockResolvedValue({ ok: false, message: 'It is not in that Pool.' });
    const view = menu(card());
    fireEvent.click(view.container.querySelector('[data-card-make-joint]')!);
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toBe('It is not in that Pool.'),
    );
    expect(view.container.querySelector('[data-joint-confirm-go]')).toBeNull();
    expect(actions.make).not.toHaveBeenCalled();
  });
});
