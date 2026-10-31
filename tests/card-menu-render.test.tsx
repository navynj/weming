// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The top card's `…` menu and pencil (H45): no conversion is offered
 * anywhere — a record opens to others through its Audience. The pencil is
 * on my records, and on Home on someone's record I wrote on, for where it
 * shows there.
 */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
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
  lanes: [{ id: 'l-games', name: 'Games', icon: '🎲' }],
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
    is_welcome: false,
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

afterEach(cleanup);

describe('the card’s menu (H45)', () => {
  it('offers no conversion, in a pool or on Home, for any record', () => {
    for (const [c, scope] of [
      [card(), SCOPE],
      [card(), null],
      [card({}, { own_pool_id: 'p-ours', declared_lane_id: null }), null],
      [card({ joint: true }), SCOPE],
    ] as const) {
      const view = menu(c, scope);
      expect(view.container.querySelector('[data-card-make-joint]')).toBeNull();
      expect(view.container.textContent).not.toMatch(/joint record of|Make it mine|Move to Home/);
      view.unmount();
    }
  });
});

describe('the pencil (H45)', () => {
  it('is on someone’s record I wrote on, on Home only', () => {
    const theirs = card({ editable: false, fileable: true });
    const onHome = menu(theirs, null);
    expect(onHome.container.querySelector('[data-card-edit]')).not.toBeNull();
    onHome.unmount();
    const inPool = menu(theirs, SCOPE);
    expect(inPool.container.querySelector('[data-card-edit]')).toBeNull();
  });

  it('is not on a record I can neither edit nor file', () => {
    const view = menu(card({ editable: false }), null);
    expect(view.container.querySelector('[data-card-edit]')).toBeNull();
  });
});
