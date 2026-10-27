// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushed: string[] = [];
const replaced: string[] = [];
vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/p-a',
  useRouter: () => ({
    push: (to: string) => pushed.push(to),
    replace: (to: string) => replaced.push(to),
    refresh: () => {},
  }),
}));
vi.mock('@/features/splash/actions', () => ({
  setSplashPinned: () => Promise.resolve({ ok: true }),
  deleteSplash: () => Promise.resolve({ ok: true }),
}));
vi.mock('@/features/pool/actions', () => ({
  deleteJointSplash: () => Promise.resolve({ ok: true }),
  leavePool: () => Promise.resolve({ ok: true }),
  savePoolLane: () => Promise.resolve({ ok: true }),
  createInvite: () => Promise.resolve({ ok: false, message: 'not in tests' }),
  revokeInvite: () => Promise.resolve({ ok: true }),
}));

import { InputSheetProvider, useInputSheet } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import { PoolActivityProvider } from '@/features/pool/activity';
import type { PoolViewKind } from '@/features/pool/pool-cards';
import { PoolGround } from '@/features/pool/pool-ground';
import { PoolIndex } from '@/features/pool/pool-index';
import { lastPool, rememberVisit } from '@/features/pool/remembered';
import type { Splash } from '@/features/splash/summary';
import type { MyPool, PoolRipple, PoolView } from '@/lib/queries/pools';
import { written } from './written-on';

const TZ = 'America/Vancouver';
const ME = 'u-me';
const MINA = 'u-mina';
const GONE = 'u-gone';

function splash(over: Partial<Splash> & { id: string }): Splash {
  return written({
    owner_id: ME,
    title: '',
    declared_start: null,
    declared_end: null,
    declared_lane_id: null,
    icon: null,
    session_id: null,
    pinned_at: null,
    pool_id: null,
    pool_lane_id: null,
    own_pool_id: null,
    joint_invite_all: false,
    created_by: null,
    type: 'free',
    prompt: null,
    ends_at: null,
    created_at: '2026-10-20T18:00:00.000Z',
    ...over,
  });
}

function ripple(over: Partial<PoolRipple> & { id: string; splash_id: string }): PoolRipple {
  return written({
    author_id: ME,
    note: 'words',
    media: [],
    occurred_on: '2026-10-21',
    occurred_time: null,
    ended_at: null,
    created_at: '2026-10-21T18:00:00.000Z',
    category_id: 'my-lane',
    started_at: null,
    ...over,
  });
}

const LANE = (id: string, pool: string, name: string, icon: string, position: number) => ({
  id,
  pool_id: pool,
  name,
  icon,
  description: null,
  position,
});

/** Pool A: two current members and one who left keeping theirs; a placed post each, and a joint splash with two ripples. */
const A: PoolView = {
  pool: { id: 'p-a', name: 'Our Pool', ownerId: ME },
  members: [
    {
      userId: ME,
      name: 'Yoonji Lee',
      initials: 'YL',
      joinedAt: '2026-10-01',
      former: false,
      timeZone: TZ,
    },
    {
      userId: MINA,
      name: 'Mina',
      initials: 'MI',
      joinedAt: '2026-10-02',
      former: false,
      timeZone: TZ,
    },
    {
      userId: GONE,
      name: 'Gone',
      initials: 'GO',
      joinedAt: '2026-10-03',
      former: true,
      timeZone: TZ,
    },
  ],
  lanes: [LANE('l-food', 'p-a', 'Food', '🍽️', 0), LANE('l-media', 'p-a', 'Media', '🎬', 1)],
  myLinks: [
    {
      poolLaneId: 'l-food',
      myCategoryId: 'my-lane',
      isDefault: true,
      shareByDefault: false,
      isHome: true,
    },
  ],
  placements: [
    { splashId: 's-mine', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: ME },
    { splashId: 's-mina', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: MINA },
    { splashId: 's-own', poolId: 'p-a', poolLaneId: 'l-media', shared: true, ownerId: ME },
  ],
  splashes: [
    // Each owns its date (H24): the day its ripples used to say.
    splash({ id: 's-mine', title: 'Fried egg', declared_start: '2026-10-22' }),
    splash({ id: 's-mina', owner_id: MINA, title: 'Hiking', declared_start: '2026-10-21' }),
    splash({ id: 's-own', own_pool_id: 'p-a', title: 'Just mine', declared_start: '2026-10-21' }),
    splash({
      id: 's-joint',
      owner_id: null,
      pool_id: 'p-a',
      pool_lane_id: 'l-media',
      created_by: MINA,
      title: 'Lost Ruins of Arnak',
      icon: '🏛️',
      declared_start: '2026-10-20',
    }),
  ],
  ripples: [
    ripple({ id: 'r-mine', splash_id: 's-mine', occurred_on: '2026-10-22' }),
    ripple({ id: 'r-mina', splash_id: 's-mina', author_id: MINA }),
    ripple({ id: 'r-own', splash_id: 's-own', category_id: null }),
    ripple({ id: 'r-j1', splash_id: 's-joint', author_id: MINA, occurred_on: '2026-10-20' }),
    ripple({ id: 'r-j2', splash_id: 's-joint', author_id: ME, occurred_on: '2026-10-20' }),
  ],
  invites: [],
  // Mina made it with me: someone besides its maker is invited, so it is filled (0033).
  together: { 's-joint': [MINA, ME] },
};

/** Pool B: nothing of A's. */
const B: PoolView = {
  pool: { id: 'p-b', name: 'Study Crew', ownerId: ME },
  members: [
    {
      userId: ME,
      name: 'Yoonji Lee',
      initials: 'YL',
      joinedAt: '2026-10-05',
      former: false,
      timeZone: TZ,
    },
  ],
  lanes: [LANE('l-notes', 'p-b', 'Notes', '📓', 0)],
  myLinks: [],
  placements: [
    { splashId: 's-study', poolId: 'p-b', poolLaneId: 'l-notes', shared: true, ownerId: ME },
  ],
  splashes: [splash({ id: 's-study', title: 'Chapter 3' })],
  ripples: [ripple({ id: 'r-study', splash_id: 's-study' })],
  invites: [],
};

const POOLS: MyPool[] = [
  { id: 'p-a', name: 'Our Pool', members: [], latestActivity: null },
  {
    id: 'p-b',
    name: 'Study Crew',
    members: [],
    latestActivity: '2026-10-22T00:00:00Z',
  },
];

/** As the shell provides them: my pools and what is new in each (review). */
const ACTIVITY = Object.fromEntries(POOLS.map((p) => [p.id, p.latestActivity]));

function ground(view: PoolView) {
  return render(
    <PoolActivityProvider activity={ACTIVITY} pools={POOLS}>
      <InputSheetProvider>
        <PoolGround view={view} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>
    </PoolActivityProvider>,
  );
}

/** The view a test's pool opens on: a visit opens on the Calendar (review); these choose. */
let startView: PoolViewKind = 'swimmers';
function setView(view: 'lane' | 'date' | 'swimmers'): void {
  startView = view;
}

beforeEach(() => {
  window.localStorage.clear();
  // A visit opens on the Calendar (review); these read Swimmers unless they choose.
  startView = 'swimmers';
  window.sessionStorage.clear();
  Element.prototype.scrollTo = function scrollTo() {} as Element['scrollTo'];
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
  pushed.length = 0;
  replaced.length = 0;
});
afterEach(cleanup);

describe('a joint splash on the grid (H23)', () => {
  it('renders once as a band in Swimmers, never as a mark in a cell', () => {
    setView('swimmers');
    const { container } = ground(A);
    expect(container.querySelectorAll('[data-joint-band="s-joint"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-cell] [data-mark="s-joint"]')).toHaveLength(0);
    // The icon and the title are the splash's, on its band.
    expect(container.querySelector('[data-joint-band="s-joint"]')!.textContent).toContain('🏛️');
  });

  it('counts its ripples and shows who wrote them at its right end, with no branches', () => {
    {
      setView('swimmers');
      const { container } = ground(A);
      const band = container.querySelector('[data-joint-band="s-joint"]')!;
      expect(band.querySelector('[data-joint-count]')!.textContent).toBe('2 ripples');
      // Mina and I, each once.
      expect(band.querySelectorAll('[data-joint-faces] > :not([data-joint-more])')).toHaveLength(2);
      expect(band.querySelector('[data-joint-more]')).toBeNull();
      expect(container.querySelector('[data-branch]')).toBeNull();
      cleanup();
    }
  });

  it('shows four faces, then +n', () => {
    setView('swimmers');
    const writers = ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6'];
    const crowded: PoolView = {
      ...A,
      members: [
        ...A.members,
        ...writers.map((userId, at) => ({
          userId,
          name: `P${at}`,
          initials: `P${at}`,
          joinedAt: `2026-10-1${at}`,
          former: false,
          timeZone: TZ,
        })),
      ],
      ripples: [
        ...A.ripples,
        ...writers.map((author_id, at) =>
          ripple({ id: `r-x${at}`, splash_id: 's-joint', author_id, occurred_on: '2026-10-20' }),
        ),
      ],
    };
    const band = ground(crowded).container.querySelector('[data-joint-band="s-joint"]')!;
    expect(band.querySelector('[data-joint-count]')!.textContent).toBe('8 ripples');
    expect(band.querySelectorAll('[data-joint-faces] > :not([data-joint-more])')).toHaveLength(4);
    expect(band.querySelector('[data-joint-more]')!.textContent).toBe('+4');
  });

  it('is one row in the Date view: icon, title, lane chip, then faces and count; no sub-rows', () => {
    setView('date');
    const { container } = ground(A);
    const rows = container.querySelectorAll('[data-pill="s-joint"]');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.textContent).toContain('🏛️');
    expect(row.textContent).toContain('Lost Ruins of Arnak');
    expect(row.textContent).toContain('Media');
    expect(row.querySelectorAll('[data-joint-faces] > :not([data-joint-more])')).toHaveLength(2);
    expect(row.querySelector('[data-joint-count]')!.textContent).toBe('2 ripples');
    // The faces and the count come after the lane chip.
    const text = row.textContent!;
    expect(text.indexOf('Media')).toBeLessThan(text.indexOf('2 ripples'));
    expect(container.querySelector('[data-joint-sub]')).toBeNull();
    expect(container.querySelector('[data-joint-rows]')).toBeNull();
  });

  it('comes to the top of the stack from its Date-view row', () => {
    setView('date');
    const { container } = ground(A);
    fireEvent.click(container.querySelector('[data-pill="s-joint"]')!);
    expect(container.querySelector('[data-pill="s-joint"]')!.hasAttribute('data-dived')).toBe(
      false,
    );
  });

  it('is a mark in its pool lane’s column in the Lane view, not a band (review)', () => {
    setView('lane');
    const { container } = ground(A);
    expect(container.querySelector('[data-joint-band]')).toBeNull();
    expect(container.querySelector('[data-cell="l-media"] [data-mark="s-joint"]')).not.toBeNull();
  });

  it('comes to the top of the stack from its band', () => {
    setView('swimmers');
    const { container } = ground(A);
    fireEvent.click(container.querySelector('[data-joint-band="s-joint"]')!);
    expect(container.querySelector('[data-mark="s-joint"]')!.hasAttribute('data-dived')).toBe(
      false,
    );
  });
});

describe('Swimmers (H23)', () => {
  it('has a column per current member, me first, never a former member', () => {
    setView('swimmers');
    const { container } = ground(A);
    const headers = [...container.querySelectorAll('[data-lane-header]')]
      .map((h) => h.getAttribute('data-lane-header'))
      .filter(Boolean);
    expect(headers).toEqual([ME, MINA]);
  });

  it('puts each placed post in its author’s column, with the author under the title', () => {
    setView('swimmers');
    const { container } = ground(A);
    const row = container.querySelector('[data-cell="u-mina"] [data-mark="s-mina"]');
    expect(row).not.toBeNull();
    setView('lane');
    cleanup();
    const lane = ground(A).container;
    expect(lane.querySelector('[data-cell="l-food"] [data-mark-author]')).not.toBeNull();
  });
});

describe('switching pools (H23)', () => {
  it('lists settings, my face, then my pools on the strip, the current one ringed, news dotted', () => {
    const { container } = ground(A);
    const strip = container.querySelector('[data-home-foot="phone"] [data-place-strip]')!;
    const order = [...strip.children].map(
      (el) =>
        (el.hasAttribute('data-strip-settings') && 'settings') ||
        (el.hasAttribute('data-strip-home') && 'home') ||
        el.getAttribute('data-strip-pool') ||
        (el.hasAttribute('data-strip-new') && 'new'),
    );
    // The order I joined them in, newest first; the `+` closes the strip.
    expect(order).toEqual(['settings', 'home', 'p-a', 'p-b', 'new']);
    const current = strip.querySelector('[data-strip-pool="p-a"]')!;
    expect(current.getAttribute('aria-current')).toBe('page');
    // Selected: a white border, and a pool is a rounded square, not a circle.
    expect(current.className).toContain('ring-white');
    expect(current.className).toContain('rounded-lg');
    expect(current.querySelector('[data-place-image]')!.className).not.toContain('opacity-50');
    // Not selected: faded — the image only, so the dot stays full strength.
    const other = strip.querySelector('[data-strip-pool="p-b"]')!;
    expect(other.querySelector('[data-place-image]')!.className).toContain('opacity-50');
    expect(other.querySelector('[data-place-image] [data-unseen-dot]')).toBeNull();
    // I am a circle.
    expect(strip.querySelector('[data-strip-home]')!.className).toContain('rounded-full');
    // Something happened in B since a visit that never was: the dot.
    expect(strip.querySelector('[data-strip-pool="p-b"] [data-unseen-dot]')).not.toBeNull();
    expect(strip.querySelector('[data-strip-pool="p-a"] [data-unseen-dot]')).toBeNull();
    expect(strip.querySelector('[data-strip-pool="p-b"]')!.getAttribute('href')).toBe('/pool/p-b');
    expect(strip.querySelector('[data-strip-new]')!.getAttribute('href')).toBe('/pool/new');
    // A pool to be is the pools' rounded square too.
    expect(strip.querySelector('[data-strip-new]')!.className).toContain('rounded-lg');
    // No name dropdown any more: the strip is the way between pools.
    expect(container.querySelector('[data-pool-switcher]')).toBeNull();
  });

  it('keeps its order when another pool is opened: a place never moves when tapped', () => {
    const order = () =>
      [...document.querySelectorAll('[data-home-foot="phone"] [data-strip-pool]')].map((el) =>
        el.getAttribute('data-strip-pool'),
      );
    ground(A);
    expect(order()).toEqual(['p-a', 'p-b']);
    cleanup();
    // Opening B (it is now the most recently visited) moves nothing.
    ground(B);
    expect(order()).toEqual(['p-a', 'p-b']);
    expect(
      document
        .querySelector('[data-home-foot="phone"] [data-strip-pool="p-b"]')!
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('lists the same places in the same order on the wide rail', () => {
    const { container } = ground(A);
    const ids = (slot: string) =>
      [
        ...container.querySelectorAll(
          `[data-home-foot="${slot}"] [data-strip-home], [data-home-foot="${slot}"] [data-strip-pool], [data-home-foot="${slot}"] [data-strip-new]`,
        ),
      ].map(
        (el) =>
          el.getAttribute('data-strip-pool') ??
          (el.hasAttribute('data-strip-home') ? 'home' : 'new'),
      );
    expect(ids('wide')).toEqual(ids('phone'));
    expect(ids('wide')).toEqual(['home', 'p-a', 'p-b', 'new']);
  });

  it('shows only the other pool’s records once switched, in the same view', () => {
    setView('swimmers');
    const first = ground(A).container;
    expect(first.querySelector('[data-mark="s-mine"]')).not.toBeNull();
    cleanup();
    const second = ground(B).container;
    expect(second.querySelector('[data-mark="s-study"]')).not.toBeNull();
    for (const id of ['s-mine', 's-mina', 's-joint']) {
      expect(second.querySelector(`[data-mark="${id}"]`)).toBeNull();
    }
    expect(
      second.querySelector('[data-view-option="swimmers"]')!.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('opens the last pool viewed on this device, after a reload', () => {
    ground(B);
    expect(lastPool()).toBe('p-b');
    cleanup();
    // A reload: the Pool tab asks the device which pool to open.
    render(
      <InputSheetProvider>
        <PoolIndex poolIds={['p-a', 'p-b']} />
      </InputSheetProvider>,
    );
    expect(replaced).toEqual(['/pool/p-b']);
  });

  it('opens the pool joined last when this device remembers none', () => {
    render(
      <InputSheetProvider>
        <PoolIndex poolIds={['p-a', 'p-b']} />
      </InputSheetProvider>,
    );
    expect(replaced).toEqual(['/pool/p-a']);
  });

  it('drops a pool’s dot once visited', () => {
    rememberVisit('p-b', new Date('2026-10-23T00:00:00Z'));
    const { container } = ground(A);
    expect(
      container.querySelector('[data-home-foot="phone"] [data-strip-pool="p-b"] [data-unseen-dot]'),
    ).toBeNull();
  });
});

describe('leaving (H23)', () => {
  it('asks to keep or remove before anything happens', () => {
    const { container, getByText } = ground(A);
    fireEvent.click(container.querySelector('[data-pool-members]')!);
    expect(container.ownerDocument.querySelector('[data-former-member]')).not.toBeNull();
    fireEvent.click(getByText('Leave Pool'));
    expect(getByText('Keep your records in this Pool?')).toBeTruthy();
    expect(getByText('Keep them')).toBeTruthy();
    expect(getByText('Remove them')).toBeTruthy();
  });
});

describe('pool lanes (H23)', () => {
  it('keeps the add form open, cleared, after each lane so the next can follow', () => {
    const { container, getByText } = ground(A);
    fireEvent.click(container.querySelector('[data-manage-pool-lanes]')!);
    fireEvent.click(getByText('+ Add lane'));
    const doc = container.ownerDocument;
    for (const name of ['Books', 'Walks']) {
      const field = doc.querySelector(
        '[data-pool-lane-form] [aria-label="Lane name"]',
      ) as HTMLInputElement;
      expect(field.value).toBe('');
      fireEvent.change(field, { target: { value: name } });
      fireEvent.keyDown(field, { key: 'Enter' });
      expect(doc.querySelector('[data-pool-lane-form]')).not.toBeNull();
    }
    const listed = [...doc.querySelectorAll('[data-pool-lane]')].map((el) => el.textContent);
    expect(listed.some((t) => t?.includes('Books'))).toBe(true);
    expect(listed.some((t) => t?.includes('Walks'))).toBe(true);
  });
});

describe('Just mine in the pool (0014)', () => {
  it('is a mark in its pool lane’s column, never a band', () => {
    setView('lane');
    const { container } = ground(A);
    expect(container.querySelector('[data-cell="l-media"] [data-mark="s-own"]')).not.toBeNull();
    expect(container.querySelector('[data-joint-band="s-own"]')).toBeNull();
  });

  it('is a mark in my column in Swimmers', () => {
    setView('swimmers');
    const { container } = ground(A);
    expect(container.querySelector(`[data-cell="${ME}"] [data-mark="s-own"]`)).not.toBeNull();
  });
});

describe('re-tapping Pool (review)', () => {
  it('opens every visit on the Calendar, whatever was viewed before, then cycles Swimmers → Lane → List → Calendar', () => {
    // A view chosen on an earlier visit, as the old build kept it: no longer read.
    window.localStorage.setItem('weming.pool-view', 'swimmers');
    const { container } = render(
      <PoolActivityProvider activity={ACTIVITY} pools={POOLS}>
        <InputSheetProvider>
          <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} />
        </InputSheetProvider>
      </PoolActivityProvider>,
    );
    const tab = container.querySelector('[data-home-foot="phone"] [data-pool-tab]') as HTMLElement;
    const selected = (): string | null =>
      container
        .querySelector('[data-view-option][aria-selected="true"]')!
        .getAttribute('data-view-option');
    expect(
      [...container.querySelectorAll('[data-view-option]')].map((o) =>
        o.getAttribute('data-view-option'),
      ),
    ).toEqual(['board', 'swimmers', 'lane', 'date']);
    // Every visit opens on the Calendar (review).
    expect(selected()).toBe('board');
    expect(container.querySelector('[data-month-board]')).not.toBeNull();
    // The stack stays beside or beneath it, as in the Lane view.
    expect(container.querySelector('[data-stack-card]')).not.toBeNull();
    fireEvent.click(tab);
    expect(selected()).toBe('swimmers');
    fireEvent.click(tab);
    expect(selected()).toBe('lane');
    fireEvent.click(tab);
    expect(selected()).toBe('date');
    // Not kept on the device: the next visit opens on the Calendar again.
    expect(window.localStorage.getItem('weming.pool-view')).toBe('swimmers');
    fireEvent.click(tab);
    expect(selected()).toBe('board');
    // The desktop rail cycles too.
    fireEvent.click(container.querySelector('[data-home-foot="wide"] [data-pool-tab]')!);
    expect(selected()).toBe('swimmers');
  });
});

describe('a pool lane’s header (review)', () => {
  it('opens its lane page, as a lane’s header does on Home', () => {
    setView('lane');
    const { container } = ground(A);
    const header = container.querySelector('[data-lane-header="l-food"]')!;
    expect(header.getAttribute('href')).toBe('/pool/p-a/lane/l-food');
  });

  it('opens nothing for a member’s column in Swimmers', () => {
    setView('swimmers');
    const { container } = ground(A);
    expect(container.querySelector(`[data-lane-header="${MINA}"]`)!.tagName).not.toBe('A');
  });
});

describe('faces (0018)', () => {
  it('writes authors out by name in the Date view, never as initials', () => {
    setView('date');
    const { container } = ground(A);
    const rows = [...container.querySelectorAll('[data-row-author]')].map((a) => a.textContent);
    expect(new Set(rows)).toEqual(new Set(['Yoonji Lee', 'Mina']));
  });

  const PEOPLE = {
    [ME]: { name: 'Yoonji Lee', photo: 'https://signed/me' },
    [MINA]: { name: 'Mina Kim', photo: 'https://signed/mina' },
    [GONE]: { name: 'Gone', photo: null },
  };
  const faces = (view: PoolView) =>
    render(
      <PeopleProvider me={ME} people={PEOPLE}>
        <InputSheetProvider>
          <PoolGround
            view={view}
            me={ME}
            today="2026-10-23"
            timeZone={TZ}
            initialView={startView}
          />
        </InputSheetProvider>
      </PeopleProvider>,
    );
  const srcs = (root: Element | null) =>
    [...(root?.querySelectorAll('img') ?? [])].map((img) => img.getAttribute('src'));

  it('shows each member’s photo in the header, the Swimmers headers and the members sheet', () => {
    setView('swimmers');
    const { container } = faces(A);
    expect(srcs(container.querySelector('[data-pool-members]'))).toEqual([
      'https://signed/me',
      'https://signed/mina',
    ]);
    expect(srcs(container.querySelector(`[data-lane-header="${MINA}"]`))).toEqual([
      'https://signed/mina',
    ]);
    // A renamed member reads by their new name.
    expect(container.querySelector(`[data-lane-header="${MINA}"]`)!.textContent).toContain(
      'Mina Kim',
    );
    fireEvent.click(container.querySelector('[data-pool-members]')!);
    expect(srcs(container.querySelector(`[data-member="${MINA}"]`))).toEqual([
      'https://signed/mina',
    ]);
    // A former member has no photo for me: initials.
    expect(container.querySelector(`[data-member="${GONE}"]`)!.textContent).toContain('GO');
  });

  it('labels a mark with its author’s current name, written out', () => {
    setView('lane');
    const { container } = faces(A);
    expect(
      container
        .querySelector('[data-mark="s-mina"]')
        ?.closest('[data-cell]')
        ?.querySelector('[data-mark-author]')?.textContent,
    ).toBe('Mina Kim');
  });
});

describe('moving a pool’s splash to another lane (0020, review)', () => {
  function Mover({
    id,
    to,
  }: {
    id: string;
    to: { id: string; icon: string; name: string } | null;
  }) {
    const { markEdited, clearEdited } = useInputSheet();
    useEffect(() => {
      if (to) markEdited(id, { title: 'Lost Ruins of Arnak', icon: '🏛️', poolLane: to });
      else clearEdited(id);
    }, [id, to, markEdited, clearEdited]);
    return null;
  }
  const FOOD = { id: 'l-food', icon: '🍽️', name: 'Food' };
  const moved = (to: typeof FOOD | null) =>
    render(
      <InputSheetProvider>
        <Mover id="s-joint" to={to} />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );

  it('shows the move at once: its mark in the new lane, its tag and chip naming it', () => {
    setView('lane');
    const { container } = moved(FOOD);
    expect(container.querySelector('[data-cell="l-food"] [data-mark="s-joint"]')).not.toBeNull();
    expect(container.querySelector('[data-cell="l-media"] [data-mark="s-joint"]')).toBeNull();
  });

  it('goes back where it was when the edit is taken back', () => {
    setView('lane');
    const { container, rerender } = moved(FOOD);
    rerender(
      <InputSheetProvider>
        <Mover id="s-joint" to={null} />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-cell="l-media"] [data-mark="s-joint"]')).not.toBeNull();
  });

  it('names the new lane on its Date-view row at once', () => {
    setView('date');
    const { container } = moved(FOOD);
    expect(container.querySelector('[data-pill="s-joint"]')!.textContent).toContain('Food');
  });
});

describe('a conversion shows at once (0022)', () => {
  function Convert({ id, kind }: { id: string; kind: 'joint' | 'own' }) {
    const { markEdited } = useInputSheet();
    useEffect(
      () =>
        markEdited(id, {
          title: 'Fried egg',
          icon: null,
          kind,
          poolLane: { id: 'l-food', icon: '🍽️', name: 'Food' },
        }),
      [id, kind, markEdited],
    );
    return null;
  }

  it('my placed splash made joint is a band across Swimmers at once', () => {
    setView('swimmers');
    const { container } = render(
      <InputSheetProvider>
        <Convert id="s-mine" kind="joint" />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-joint-band="s-mine"]')).not.toBeNull();
  });

  it('a joint splash made mine is a mark under my name at once', () => {
    setView('swimmers');
    const { container } = render(
      <InputSheetProvider>
        <Convert id="s-joint" kind="own" />
        <PoolGround view={A} me={ME} today="2026-10-23" timeZone={TZ} initialView={startView} />
      </InputSheetProvider>,
    );
    expect(container.querySelector('[data-joint-band="s-joint"]')).toBeNull();
    expect(container.querySelector(`[data-cell="${ME}"] [data-mark="s-joint"]`)).not.toBeNull();
  });
});

describe('a joint splash reads as the pool’s at a glance (review)', () => {
  it('is a rounded square in the Lane view; a post of one person stays a disc', () => {
    setView('lane');
    const { container } = ground(A);
    const joint = container.querySelector('[data-mark="s-joint"]') as HTMLElement;
    expect(joint.hasAttribute('data-joint-mark')).toBe(true);
    expect(joint.className).toContain('rounded-lg');
    expect(joint.className).not.toContain('rounded-full');
    expect(joint.style.width).toBe('28px');
    const mine = container.querySelector('[data-mark="s-mine"]') as HTMLElement;
    expect(mine.hasAttribute('data-joint-mark')).toBe(false);
    expect(mine.className).toContain('rounded-full');
  });

  it('is a pill across the whole row in the Date view', () => {
    setView('date');
    const { container } = ground(A);
    const row = container.querySelector('[data-pill="s-joint"]')!;
    expect(row.hasAttribute('data-joint-pill')).toBe(true);
    expect(row.className).toContain('rounded-full');
    expect(row.className).toContain('w-full');
    const plain = container.querySelector('[data-pill="s-mine"]')!;
    expect(plain.hasAttribute('data-joint-pill')).toBe(false);
    expect(plain.className).toContain('border-b');
  });

  it('is a plain row with Everyone off and nobody besides its maker picked (0033)', () => {
    setView('date');
    const { container } = ground({ ...A, together: { 's-joint': [MINA] } });
    const row = container.querySelector('[data-pill="s-joint"]')!;
    expect(row.hasAttribute('data-joint-pill')).toBe(false);
    expect(row.className).toContain('border-b');
  });

  it('is a pill with Everyone on, even in a pool of one (0033)', () => {
    setView('date');
    const { container } = ground({
      ...A,
      splashes: A.splashes.map((s) => (s.id === 's-joint' ? { ...s, joint_invite_all: true } : s)),
      together: { 's-joint': [MINA] },
    });
    expect(container.querySelector('[data-pill="s-joint"]')!.hasAttribute('data-joint-pill')).toBe(
      true,
    );
  });
});

describe('the joint surface is solid, and the faces’ ring is its colour (review)', () => {
  const SURFACE = 'bg-joint';
  const RING = 'ring-joint';
  const faces = (root: Element) => [
    ...root.querySelectorAll('[data-joint-faces] > :not([data-joint-more])'),
  ];

  it('on the Swimmers band', () => {
    setView('swimmers');
    const band = ground(A).container.querySelector('[data-joint-band="s-joint"]')!;
    expect(band.className).toContain(SURFACE);
    expect(band.className).not.toMatch(/bg-white\//);
    expect(faces(band).every((face) => face.className.includes(RING))).toBe(true);
  });

  it('on the Date view’s pill row', () => {
    setView('date');
    const row = ground(A).container.querySelector('[data-pill="s-joint"]')!;
    expect(row.className).toContain(SURFACE);
    expect(row.className).not.toMatch(/bg-white\//);
    expect(faces(row).every((face) => face.className.includes(RING))).toBe(true);
  });
});

describe('a day reads newest first, bands and marks alike (review)', () => {
  // An older post of mine on the joint splash's day (Oct 20), written before it.
  const C: PoolView = {
    ...A,
    splashes: [
      ...A.splashes,
      splash({
        id: 's-old',
        title: 'Older',
        declared_start: '2026-10-20',
        created_at: '2026-10-19T18:00:00.000Z',
      }),
    ],
    ripples: [
      ...A.ripples,
      ripple({
        id: 'r-old',
        splash_id: 's-old',
        occurred_on: '2026-10-20',
        created_at: '2026-10-19T18:00:00.000Z',
      }),
    ],
    placements: [
      ...A.placements,
      { splashId: 's-old', poolId: 'p-a', poolLaneId: 'l-food', shared: true, ownerId: ME },
    ],
  };

  it('puts the newer joint band above the older mark of the same day, the date named once', () => {
    setView('swimmers');
    const { container } = ground(C);
    const band = container.querySelector('[data-joint-band="s-joint"]')!;
    const older = container.querySelector('[data-mark="s-old"]')!;
    // The band precedes the older mark in the grid.
    expect(band.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Oct 20 is named on the band's rail; the row after it leaves the rail blank.
    expect(container.querySelectorAll('[data-day-row="2026-10-20"]')).toHaveLength(1);
    expect(container.querySelector('[data-day-continued="2026-10-20"]')).not.toBeNull();
  });
});

describe('a joint band on top of the stack reads as the top card does (review)', () => {
  it('turns white with blue words and a pale icon, its faces ringed white; back to the joint surface when not on top', () => {
    setView('swimmers');
    const { container } = ground(A);
    const band = () => container.querySelector('[data-joint-band="s-joint"]')!;
    // Not on top yet: the solid joint surface.
    expect(band().hasAttribute('data-dived')).toBe(true);
    expect(band().className).toContain('bg-joint');
    fireEvent.click(band());
    expect(band().hasAttribute('data-dived')).toBe(false);
    expect(band().className).toContain('bg-white');
    expect(band().className).toContain('text-main-900');
    expect(band().querySelector('.bg-main-100\\/60')).not.toBeNull();
    const faces = [...band().querySelectorAll('[data-joint-faces] > :not([data-joint-more])')];
    expect(faces.every((face) => face.className.includes('ring-white'))).toBe(true);
    expect(band().querySelector('[data-joint-count]')!.className).toContain('text-main-900/70');
  });
});
