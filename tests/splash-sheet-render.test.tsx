// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drops: Record<string, unknown>[] = [];
/** What was written, in order: the splash, then its description. */
const written: string[] = [];
const described: [string, string][] = [];
vi.mock('@/features/splash/actions', () => ({
  dropSplash: (input: Record<string, unknown>) => {
    drops.push(input);
    written.push('splash');
    return Promise.resolve({ ok: true, splash: { id: 's-new', title: input.title } });
  },
  setSplashDescription: (id: string, text: string) => {
    described.push([id, text]);
    written.push('description');
    return Promise.resolve({ ok: true });
  },
}));
const placed: { splashId: string; picks: { poolId: string; poolLaneId: string }[] }[] = [];
const joints: Record<string, unknown>[] = [];
const owns: Record<string, unknown>[] = [];
vi.mock('@/features/pool/actions', () => ({
  placeNewSplash: (splashId: string, picks: { poolId: string; poolLaneId: string }[]) => {
    placed.push({ splashId, picks });
    return Promise.resolve({ ok: true });
  },
  createJointSplash: (input: Record<string, unknown>) => {
    joints.push(input);
    return Promise.resolve({ ok: true, id: input.id });
  },
  dropOwnPoolSplash: (input: Record<string, unknown>) => {
    owns.push(input);
    return Promise.resolve({ ok: true, id: input.id });
  },
}));
const pathname = '/';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => pathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock('@/lib/downscale', async (actual) => ({
  ...(await actual<typeof import('@/lib/downscale')>()),
  downscale: (file: File) => Promise.resolve(file),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'a1' } } }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  }),
}));

import { ownPoolColumn } from '@/features/home/grid';
import { InputSheetProvider, type PendingDrop } from '@/features/input-sheet/sheet-provider';
import { PeopleProvider } from '@/features/people/people-provider';
import type { AudiencePool } from '@/features/pool/audience-sheet';
import type { PoolScope } from '@/features/pool/compose-scope';
import {
  SHEET_MAX_HEIGHT,
  SplashSheet,
  type DropHandoff,
} from '@/features/splash-sheet/splash-sheet';
import type { SplashSummary } from '@/features/splash/summary';
import { composeDrop, splitTitle } from '@/features/splash-sheet/split-title';
import type { MyCategory } from '@/lib/queries/profile';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';

function lane(id: string, name: string, icon: string, position: number): MyCategory {
  return {
    id,
    user_id: 'a1',
    name,
    icon,
    default_mode: 'drop',
    position,
    created_at: '2026-01-01T00:00:00Z',
  };
}
const LANES = [
  lane('c-place', 'Place', '📍', 0),
  lane('c-mood', 'Mood', '🌤️', 1),
  lane('c-day', 'Day', '🖋', 2),
];
/** The pools I am in, with their lanes: Audience's rows and chips. */
const POOLS: AudiencePool[] = [
  {
    id: 'p-ours',
    name: 'Our Pool',
    lanes: [
      { id: 'pl-trips', name: 'Trips', icon: '🏕' },
      { id: 'pl-notes', name: 'Notes', icon: '📓' },
    ],
  },
  {
    id: 'p-crew',
    name: 'Crew',
    lanes: [
      { id: 'cr-out', name: 'Outings', icon: '🚲' },
      { id: 'cr-chat', name: 'Chat', icon: '💬' },
    ],
  },
];
/** The last Audience picks on this device (0033), kept clean between tests. */
const LAST_PICK = 'weming.audience.lastPick';
const store = (picks: Record<string, string>) =>
  window.localStorage.setItem(LAST_PICK, JSON.stringify(picks));
const stored = (): unknown => JSON.parse(window.localStorage.getItem(LAST_PICK) ?? 'null');

beforeEach(() => {
  drops.length = 0;
  placed.length = 0;
  joints.length = 0;
  owns.length = 0;
  handoffs.length = 0;
  window.URL.createObjectURL = () => 'blob:preview';
  window.localStorage.removeItem(LAST_PICK);
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LAST_PICK);
});

/** The handoffs the sheet made: the post as the ground should show it, and its month. */
const handoffs: { splash: SplashSummary; month: string }[] = [];

function sheet() {
  const onDrop = vi.fn((drop: DropHandoff) => {
    handoffs.push({ splash: drop.splash, month: drop.month });
    void drop.commit();
  });
  const view = render(
    <SplashSheet
      context={{
        categories: LANES,
        timeZone: TZ,
        today: TODAY,
        pools: POOLS,
        initials: 'YL',
      }}
      onClose={() => {}}
      onDrop={onDrop}
    />,
  );
  return { ...view, onDrop, drop: () => view.getByText('Drop') as HTMLButtonElement };
}

describe('the composer’s top line and the description (review)', () => {
  beforeEach(() => {
    written.length = 0;
    described.length = 0;
  });

  it('shows `…` at the right and no face of mine; no description field unasked', () => {
    const view = sheet();
    const top = view.container.querySelector('[data-compose-top]')!;
    expect(view.container.querySelector('[data-compose-author]')).toBeNull();
    expect(top.lastElementChild!.querySelector('[data-compose-more]')).not.toBeNull();
    expect(view.container.querySelector('[data-compose-description-field]')).toBeNull();
    expect(view.container.textContent).not.toContain('Add splash description');
  });

  it('adds the description from `…`, faint until written, and saves it after the splash', async () => {
    const view = sheet();
    fireEvent.click(view.container.querySelector('[data-compose-more]')!);
    fireEvent.click(view.container.querySelector('[data-compose-description="add"]')!);
    const field = view.container.querySelector<HTMLTextAreaElement>(
      '[data-compose-description-field]',
    )!;
    expect(document.activeElement).toBe(field);
    expect(field.className).toContain('placeholder:opacity-30');
    fireEvent.change(field, { target: { value: '  Three days up north.  ' } });
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Whistler' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(described).toHaveLength(1));
    expect(written).toEqual(['splash', 'description']);
    expect(described[0][1]).toBe('Three days up north.');
    expect(described[0][0]).toBe(drops.at(-1)!.id);
    expect(handoffs.at(-1)!.splash).toMatchObject({ description: 'Three days up north.' });
    // The next splash starts without one.
    expect(view.container.querySelector('[data-compose-description-field]')).toBeNull();
  });

  it('drops nothing of a description hidden again', async () => {
    const view = sheet();
    fireEvent.click(view.container.querySelector('[data-compose-more]')!);
    fireEvent.click(view.container.querySelector('[data-compose-description="add"]')!);
    fireEvent.change(view.container.querySelector('[data-compose-description-field]')!, {
      target: { value: 'Not this' },
    });
    fireEvent.click(view.container.querySelector('[data-compose-more]')!);
    fireEvent.click(view.container.querySelector('[data-compose-description="hide"]')!);
    expect(view.container.querySelector('[data-compose-description-field]')).toBeNull();
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Whistler' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(written).toEqual(['splash']));
    expect(described).toEqual([]);
  });
});

describe('the first line is the title (SPEC 6)', () => {
  it('splits at the first Enter, and a single line is untitled', () => {
    expect(splitTitle('Whistler\nsea to sky\nfog the whole way')).toEqual({
      title: 'Whistler',
      body: 'sea to sky\nfog the whole way',
    });
    expect(splitTitle('coffee went cold')).toEqual({ title: '', body: 'coffee went cold' });
    expect(splitTitle('Just a title\n')).toEqual({ title: 'Just a title', body: '' });
    // Across the two fields: a title alone is a titled post with nothing in
    // it yet, never an untitled block; the dump is a line in the content alone.
    expect(composeDrop('Whistler', '')).toEqual({ title: 'Whistler', body: '' });
    expect(composeDrop('Whistler', 'sea to sky')).toEqual({
      title: 'Whistler',
      body: 'sea to sky',
    });
    expect(composeDrop('', 'coffee went cold')).toEqual({
      title: '',
      body: 'coffee went cold',
    });
  });

  it('commits a title alone as a titled post with nothing in it yet', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Whistler' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ title: 'Whistler', body: '' });
    expect(handoffs[0].splash).toMatchObject({ title: 'Whistler', count: 0, ghostTitle: null });
  });

  it('keeps a title-only post’s date as its own declaration, with no ripple to carry it', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Whistler' } });
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-09-20' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredStart: '2026-09-20', declaredEnd: null, body: '' });
  });

  it('puts the date on the post, never on its first ripple (H24)', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'a' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredStart: TODAY, declaredEnd: null });
    expect(drops[0]).not.toHaveProperty('occurredOn');
    expect(drops[0]).not.toHaveProperty('occurredTime');
  });

  it('commits a line in the content alone as an untitled post whose line is its block', async () => {
    const view = sheet();
    expect(view.drop().disabled).toBe(true);
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'coffee went cold' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({
      title: '',
      body: 'coffee went cold',
      declaredLaneId: null,
      sessionId: null,
      // Today is in the field from the start: the post's date (H24).
      declaredStart: TODAY,
    });
    // Handed over at once, the post as the ground should show it: a real id,
    // an untitled post of one block resting on today.
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].month).toBe('2026-09');
    expect(handoffs[0].splash).toMatchObject({ title: '', count: 1, orphan: false });
    expect(handoffs[0].splash.ghostTitle).toBe('coffee went cold');
    expect(handoffs[0].splash.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(drops[0]).toMatchObject({ id: handoffs[0].splash.id });
  });

  it('commits the title field as the title and the body field as the first block', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Whistler' } });
    fireEvent.change(view.getByLabelText('Content'), {
      target: { value: 'sea to sky\n\nfog the whole way' },
    });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ title: 'Whistler', body: 'sea to sky\n\nfog the whole way' });
  });

  it('takes the post\u2019s own icon, one glyph, and leaves it empty for the lane to stand in', async () => {
    const view = sheet();
    const icon = view.getByLabelText('Icon');
    expect(icon.getAttribute('data-emoji-input')).not.toBeNull();
    fireEvent.change(icon, { target: { value: '🎬🍿' } });
    expect((icon as HTMLInputElement).value).toBe('🎬');
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Toy Story 5' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ title: 'Toy Story 5', icon: '🎬' });
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'No icon' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(2));
    expect(drops[1]).toMatchObject({ title: 'No icon', icon: null });
  });

  it('is two fields in one voice: the title large and bold, the content smaller and lighter', () => {
    const { container } = sheet();
    const title = container.querySelector<HTMLTextAreaElement>('[data-sheet-title]')!;
    const body = container.querySelector<HTMLTextAreaElement>('[data-sheet-body]')!;
    expect(title.placeholder).toBe('Drop your splash');
    expect(body.placeholder).toBe('Enter the content');
    expect(title.className).toContain('text-3xl');
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('text-main-900');
    expect(body.className).toContain('text-base');
    expect(body.className).toContain('font-light');
    expect(title.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves from the title to the content on Enter: the first line stays the title', () => {
    const { container } = sheet();
    const title = container.querySelector<HTMLTextAreaElement>('[data-sheet-title]')!;
    const body = container.querySelector<HTMLTextAreaElement>('[data-sheet-body]')!;
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter' });
    expect(document.activeElement).toBe(body);
    fireEvent.change(title, { target: { value: 'two\nlines' } });
    expect(title.value).toBe('twolines');
  });

  it('stays in the title while an IME is composing: that Enter commits the character', () => {
    const { container } = sheet();
    const title = container.querySelector<HTMLTextAreaElement>('[data-sheet-title]')!;
    title.focus();
    fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
    expect(document.activeElement).toBe(title);
    fireEvent.keyDown(title, { key: 'Enter', keyCode: 229 });
    expect(document.activeElement).toBe(title);
  });

  it('walks back to the end of the title on Backspace at the start of the content', () => {
    const { container } = sheet();
    const title = container.querySelector<HTMLTextAreaElement>('[data-sheet-title]')!;
    const body = container.querySelector<HTMLTextAreaElement>('[data-sheet-body]')!;
    fireEvent.change(title, { target: { value: 'Whistler' } });
    fireEvent.change(body, { target: { value: 'sea to sky' } });
    body.focus();
    body.setSelectionRange(0, 0);
    fireEvent.keyDown(body, { key: 'Backspace' });
    expect(document.activeElement).toBe(title);
    expect(title.selectionStart).toBe('Whistler'.length);
    expect(body.value).toBe('sea to sky');

    // Anywhere else in the body, Backspace is Backspace.
    body.focus();
    body.setSelectionRange(3, 3);
    fireEvent.keyDown(body, { key: 'Backspace' });
    expect(document.activeElement).toBe(body);
  });

  it('opens with today as the post’s date, days only; removed, the post still rests on today', async () => {
    const view = sheet();
    expect((view.getByLabelText('Date') as HTMLInputElement).value).toBe(TODAY);
    // The post's days have no clock (H24).
    expect(view.queryByLabelText('Time')).toBeNull();
    fireEvent.click(view.getByLabelText('Remove the time'));
    expect(view.getByText('+ Add Date')).toBeTruthy();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'a' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredStart: TODAY });
  });
});

describe('the sheet’s shape', () => {
  it('is one white sheet on the dimmed ground, capped near fullscreen by the safe area', () => {
    const { container, getByRole } = sheet();
    const dialog = getByRole('dialog');
    expect(dialog.className).toContain(SHEET_MAX_HEIGHT);
    expect(SHEET_MAX_HEIGHT).toMatch(/100dvh/);
    expect(SHEET_MAX_HEIGHT).toMatch(/safe-area-inset-top/);
    expect(dialog.className).toContain('bg-white');
    expect(container.querySelector('[aria-label="Close"]')!.className).toContain('bg-main-900/60');
    expect(getByRole('dialog').querySelector('textarea')!.getAttribute('placeholder')).toBe(
      'Drop your splash',
    );
  });

  it('fills the selected lane chip with ink, never blue, and declares it (H20f, H21f)', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('Place'));
    expect(view.getByText('Place').className).toContain('bg-ink');
    expect(view.getByText('Place').className).not.toContain('bg-main-900');
    // A chip alone is a valid post: the zero-character diary (E1).
    expect(view.drop().disabled).toBe(false);
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredLaneId: 'c-place', body: '' });
  });

  it('has no Timer, no per-ripple audience, no mode toggle, no Add to Splash', () => {
    const { queryByText, queryByRole, container } = sheet();
    expect(queryByText('Timer')).toBeNull();
    // The post's Audience chip is the one audience here (H23); ripples have none.
    expect(container.querySelectorAll('[data-audience-chip]')).toHaveLength(1);
    expect(queryByText(/everyone/i)).toBeNull();
    expect(queryByRole('group', { name: 'View' })).toBeNull();
    expect(queryByText('+ Add to Splash')).toBeNull();
  });
});

describe('the affordances under the text', () => {
  it('dates the post, and the ground scopes to that month on commit', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'a' } });
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-08-17' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredStart: '2026-08-17' });
    expect(handoffs[0].month).toBe('2026-08');
    expect(handoffs[0].splash.range).toEqual({ start: '2026-08-17', end: '2026-08-17' });
  });

  it('gives the first block a day inside the post’s range, and none without a range (0031)', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'surf' } });
    expect(view.queryByLabelText('Day')).toBeNull();
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-09-20' } });
    fireEvent.click(view.getByText('+ add end date'));
    fireEvent.change(view.getByLabelText('End date'), { target: { value: '2026-09-28' } });
    // Today (Sep 25) is inside Sep 20–28: the chip starts there, the range's days only.
    const day = view.getByLabelText('Day') as HTMLSelectElement;
    expect(day.value).toBe(TODAY);
    expect(day.options).toHaveLength(9);
    fireEvent.change(day, { target: { value: '2026-09-22' } });
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(drops[0]).toMatchObject({
      declaredStart: '2026-09-20',
      declaredEnd: '2026-09-28',
      blockDay: '2026-09-22',
    });
  });

  it('has no session field: sessions are date-based, a post is shelved by its dates', () => {
    const { queryByText, container } = sheet();
    expect(queryByText('+ Add to Session')).toBeNull();
    expect(container.querySelector('[data-session-chip]')).toBeNull();
  });

  it('offers + Add Image', () => {
    const { getByText, container } = sheet();
    expect(getByText('+ Add Image')).toBeTruthy();
    expect(container.querySelector('[data-media-input]')).not.toBeNull();
  });
});

describe('the Audience chip (H23, 0033)', () => {
  const chip = (view: ReturnType<typeof sheet>) =>
    view.container.querySelector('[data-audience-chip]') as HTMLButtonElement;
  const crewSwitch = (view: ReturnType<typeof sheet>) =>
    view.getByRole('switch', { name: 'Shared to Crew' });
  const laneChip = (view: ReturnType<typeof sheet>, id: string) =>
    view.container.querySelector(`[data-audience-lane="${id}"]`) as HTMLButtonElement | null;

  it('is Only me for every lane: Audience is per record (H45)', () => {
    const view = sheet();
    expect(chip(view).textContent).toBe('Only me');
    for (const lane of ['Place', 'Mood', 'Day']) {
      fireEvent.click(view.getAllByText(lane)[0]);
      expect(chip(view).textContent).toBe('Only me');
    }
  });

  it('never turns a pool on by itself, a last pick included', () => {
    store({ 'c-place:p-crew': 'cr-chat' });
    const view = sheet();
    fireEvent.click(view.getByText('Place'));
    fireEvent.click(chip(view));
    expect(crewSwitch(view).getAttribute('aria-checked')).toBe('false');
    expect(view.container.querySelector('[data-audience-lanes="p-crew"]')).toBeNull();
    expect(
      view.getByRole('switch', { name: 'Shared to Our Pool' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('turns a pool on at the pool lane last picked for that lane and pool', () => {
    store({ 'c-day:p-crew': 'cr-chat', 'c-mood:p-crew': 'cr-out' });
    const view = sheet();
    fireEvent.click(view.getByText('Day'));
    fireEvent.click(chip(view));
    fireEvent.click(crewSwitch(view));
    expect(laneChip(view, 'cr-chat')!.getAttribute('aria-pressed')).toBe('true');
    expect(chip(view).textContent).toBe('Crew · 💬 Chat');
  });

  it('with nothing to start on, shows the lanes and shares nothing until one is picked, then remembers it', () => {
    const view = sheet();
    fireEvent.click(view.getByText('Day'));
    fireEvent.click(chip(view));
    fireEvent.click(crewSwitch(view));
    expect(crewSwitch(view).getAttribute('aria-checked')).toBe('true');
    expect(view.container.querySelector('[data-audience-lanes="p-crew"]')).not.toBeNull();
    expect(laneChip(view, 'cr-out')!.getAttribute('aria-pressed')).toBe('false');
    expect(laneChip(view, 'cr-chat')!.getAttribute('aria-pressed')).toBe('false');
    expect(chip(view).textContent).toBe('Only me');
    fireEvent.click(laneChip(view, 'cr-out')!);
    expect(chip(view).textContent).toBe('Crew · 🚲 Outings');
    expect(stored()).toEqual({ 'c-day:p-crew': 'cr-out' });
    // Off again: the row folds and nothing is shared.
    fireEvent.click(crewSwitch(view));
    expect(view.container.querySelector('[data-audience-lanes="p-crew"]')).toBeNull();
    expect(chip(view).textContent).toBe('Only me');
  });

  it('keeps an audience edited by hand when the lane changes', () => {
    const view = sheet();
    fireEvent.click(view.getByText('Place'));
    fireEvent.click(chip(view));
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Our Pool' }));
    fireEvent.click(laneChip(view, 'pl-trips')!);
    // The sheet stays open over the composer; the chip already reads the edit.
    expect(chip(view).textContent).toBe('Our Pool · 🏕 Trips');
    fireEvent.click(view.getAllByText('Day')[0]);
    expect(chip(view).textContent).toBe('Our Pool · 🏕 Trips');
  });

  it('places the dropped record where the chip says, on its pool lane', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Twin Falls' } });
    fireEvent.click(view.getByText('Place'));
    fireEvent.click(chip(view));
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Our Pool' }));
    fireEvent.click(laneChip(view, 'pl-trips')!);
    fireEvent.click(view.drop());
    await waitFor(() => expect(placed).toHaveLength(1));
    expect(placed[0].picks).toEqual([{ poolId: 'p-ours', poolLaneId: 'pl-trips' }]);
  });

  it('places nothing for a record that is Only me', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'private' } });
    fireEvent.click(view.getByText('Day'));
    fireEvent.click(view.drop());
    await waitFor(() => expect(drops).toHaveLength(1));
    expect(placed).toEqual([]);
  });
});

describe('compose from a pool (H23, 0033)', () => {
  const SCOPE: PoolScope = {
    poolId: 'p-ours',
    poolName: 'Our Pool',
    lanes: [
      { id: 'pl-trips', name: 'Trips', icon: '🏕' },
      { id: 'pl-notes', name: 'Notes', icon: '📓' },
    ],
    members: [
      { id: 'a1', name: 'Yoonji', initials: 'YL' },
      { id: 'u-mina', name: 'Mina', initials: 'MK' },
      { id: 'u-jae', name: 'Jae', initials: 'JP' },
    ],
  };
  /** What the pool sheet handed over, Home's seating included. */
  const poolDrops: PendingDrop[] = [];
  beforeEach(() => {
    poolDrops.length = 0;
  });
  function poolSheet(scope: PoolScope = SCOPE) {
    const onDrop = vi.fn((drop: DropHandoff) => {
      poolDrops.push(drop as PendingDrop);
      void drop.commit();
    });
    const view = render(
      <PeopleProvider me="a1" people={{}}>
        <InputSheetProvider>
          <SplashSheet
            context={{
              categories: LANES,
              timeZone: TZ,
              today: TODAY,
              pools: POOLS,
              initials: 'YL',
            }}
            pool={scope}
            onClose={() => {}}
            onDrop={onDrop}
          />
        </InputSheetProvider>
      </PeopleProvider>,
    );
    return { ...view, onDrop, drop: () => view.getByText('Drop') as HTMLButtonElement };
  }
  type View = ReturnType<typeof poolSheet>;
  const pickLane = (view: View, id: string) =>
    fireEvent.click(view.container.querySelector(`[data-pick-pool-lane="${id}"]`)!);
  const face = (view: View, id: string) =>
    view.container.querySelector(`[data-together-face="${id}"]`) as HTMLButtonElement | null;
  const everyone = (view: View) =>
    view.container.querySelector('[data-together-everyone] [role="switch"]') as HTMLButtonElement;
  const pressed = (el: Element | null) => el?.getAttribute('aria-pressed');
  const hint = (view: View) => view.container.querySelector('[data-landing-hint]')!.textContent;

  it('shows the pool’s lanes alone, with no My lanes tab, no Audience and no Just mine', () => {
    const view = poolSheet();
    expect(view.queryByRole('tab', { name: 'My lanes' })).toBeNull();
    expect(view.container.querySelectorAll('[data-pick-pool-lane]')).toHaveLength(2);
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
    expect(view.queryByRole('switch', { name: 'Just mine' })).toBeNull();
    pickLane(view, 'pl-trips');
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
  });

  it('offers With: Everyone with its switch, then the other members’ faces, never mine', () => {
    const view = poolSheet();
    const together = view.container.querySelector('[data-together]')!;
    expect(together.textContent).toContain('With');
    expect(together.textContent).not.toContain('Together');
    expect(view.container.querySelector('[data-together-everyone]')!.textContent).toBe('@everyone');
    expect(everyone(view).getAttribute('aria-checked')).toBe('false');
    expect(face(view, 'a1')).toBeNull();
    expect(pressed(face(view, 'u-mina'))).toBe('false');
    expect(pressed(face(view, 'u-jae'))).toBe('false');
  });

  it('with nobody in Together, drops my pool record on the chosen pool lane', async () => {
    const view = poolSheet();
    expect(view.drop().disabled).toBe(true);
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'my notes' } });
    // A pool lane must be chosen, or it would not land in the pool.
    expect(view.drop().disabled).toBe(true);
    pickLane(view, 'pl-notes');
    expect(hint(view)).toBe('Yours · in Our Pool');
    fireEvent.click(view.drop());
    await waitFor(() => expect(owns).toHaveLength(1));
    expect(owns[0]).toMatchObject({
      poolId: 'p-ours',
      poolLaneId: 'pl-notes',
      body: 'my notes',
      declaredStart: TODAY,
    });
    expect(joints).toEqual([]);
    expect(drops).toEqual([]);
    expect(placed).toEqual([]);
  });

  it('with faces picked, drops a joint record inviting them', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Rematch Friday' } });
    pickLane(view, 'pl-trips');
    fireEvent.click(face(view, 'u-mina')!);
    expect(pressed(face(view, 'u-mina'))).toBe('true');
    expect(hint(view)).toBe('Together with Mina');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    // The record carries the pool lane and the date; my ripple carries no lane (H24).
    expect(joints[0]).toMatchObject({
      poolId: 'p-ours',
      poolLaneId: 'pl-trips',
      declaredStart: TODAY,
      invitees: ['u-mina'],
      everyone: false,
    });
    expect(joints[0]).not.toHaveProperty('myCategoryId');
    expect(owns).toEqual([]);
    expect(placed).toEqual([]);
  });

  it('Everyone picks every face and drops a joint record with everyone', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Game night' } });
    pickLane(view, 'pl-notes');
    fireEvent.click(everyone(view));
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
    expect(pressed(face(view, 'u-mina'))).toBe('true');
    expect(pressed(face(view, 'u-jae'))).toBe('true');
    expect(hint(view)).toBe('Together with everyone');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ poolLaneId: 'pl-notes', invitees: [], everyone: true });
  });

  it('deselecting a face turns Everyone off and keeps the others picked', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Hike' } });
    pickLane(view, 'pl-trips');
    fireEvent.click(everyone(view));
    fireEvent.click(face(view, 'u-mina')!);
    expect(everyone(view).getAttribute('aria-checked')).toBe('false');
    expect(pressed(face(view, 'u-mina'))).toBe('false');
    expect(pressed(face(view, 'u-jae'))).toBe('true');
    expect(hint(view)).toBe('Together with Jae');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ invitees: ['u-jae'], everyone: false });
  });

  it('picking every face by hand leaves Everyone off', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Hike' } });
    pickLane(view, 'pl-trips');
    fireEvent.click(face(view, 'u-mina')!);
    fireEvent.click(face(view, 'u-jae')!);
    expect(everyone(view).getAttribute('aria-checked')).toBe('false');
    expect(hint(view)).toBe('Together with Mina, Jae');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ invitees: ['u-mina', 'u-jae'], everyone: false });
  });

  it('turning Everyone off picks nobody: back to my pool record', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'solo' } });
    pickLane(view, 'pl-notes');
    fireEvent.click(everyone(view));
    fireEvent.click(everyone(view));
    expect(pressed(face(view, 'u-mina'))).toBe('false');
    expect(hint(view)).toBe('Yours · in Our Pool');
    fireEvent.click(view.drop());
    await waitFor(() => expect(owns).toHaveLength(1));
    expect(joints).toEqual([]);
  });

  it('starts on Everyone where the pool invites all by default, and again after a drop', async () => {
    const view = poolSheet({ ...SCOPE, inviteAllByDefault: true });
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
    expect(pressed(face(view, 'u-mina'))).toBe('true');
    expect(pressed(face(view, 'u-jae'))).toBe('true');
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Rematch' } });
    pickLane(view, 'pl-trips');
    expect(hint(view)).toBe('Together with everyone');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ invitees: [], everyone: true });
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
  });

  it('in a pool of one, shows With and starts on Everyone, with no faces (0033)', async () => {
    const view = poolSheet({ ...SCOPE, members: [{ id: 'a1', name: 'Yoonji', initials: 'YL' }] });
    expect(view.container.querySelector('[data-together]')).not.toBeNull();
    expect(view.container.querySelectorAll('[data-together-face]')).toHaveLength(0);
    expect(everyone(view).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Alone' } });
    pickLane(view, 'pl-trips');
    expect(hint(view)).toBe('Together with everyone');
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ invitees: [], everyone: true });
  });

  it('in a pool of one, Everyone turned off drops my pool record', async () => {
    const view = poolSheet({ ...SCOPE, members: [{ id: 'a1', name: 'Yoonji', initials: 'YL' }] });
    fireEvent.click(everyone(view));
    expect(everyone(view).getAttribute('aria-checked')).toBe('false');
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Mine alone' } });
    pickLane(view, 'pl-trips');
    expect(hint(view)).toBe('Yours · in Our Pool');
  });

  it('seats a joint record in the pool’s column on Home: nothing is filed yet (H45)', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Twin Falls' } });
    pickLane(view, 'pl-trips');
    fireEvent.click(face(view, 'u-mina')!);
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(poolDrops[0].home?.card).toMatchObject({
      column: ownPoolColumn('p-ours'),
      joint: true,
    });
    expect(poolDrops[0].home?.column).toMatchObject({ id: ownPoolColumn('p-ours') });
    expect(poolDrops[0].pool).toMatchObject({ poolId: 'p-ours', card: { column: 'pl-trips' } });
  });

  it('seats my pool record in the pool’s column, with the lane’s emoji', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Chapter 3' } });
    pickLane(view, 'pl-notes');
    fireEvent.click(view.drop());
    await waitFor(() => expect(owns).toHaveLength(1));
    expect(poolDrops[0].home?.card).toMatchObject({
      column: ownPoolColumn('p-ours'),
      lane: { icon: '📓', name: 'Our Pool' },
    });
    expect(poolDrops[0].home?.column).toMatchObject({
      id: ownPoolColumn('p-ours'),
      name: 'Our Pool',
    });
  });

  it('renders one filled row — the lane chips — and no link row', () => {
    const view = poolSheet();
    pickLane(view, 'pl-trips');
    const filled = [...view.container.querySelectorAll('[data-pool-lane-picker] .bg-ink')];
    // Only the chosen lane chip is filled in ink: faces are off, Everyone is text.
    expect(filled.map((el) => el.getAttribute('data-pick-pool-lane'))).toEqual(['pl-trips']);
    expect(view.container.querySelector('[data-joint-unlinked]')).toBeNull();
    expect(view.container.querySelector('[data-link-it]')).toBeNull();
  });
});
