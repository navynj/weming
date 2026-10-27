// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const commits: Record<string, unknown>[] = [];
vi.mock('@/features/input-sheet/commit', () => ({
  commitRipple: (draft: Record<string, unknown>) => {
    commits.push(draft);
    return Promise.resolve({ ok: true, rippleId: 'new' });
  },
}));
vi.mock('@/features/ripple-sheet/actions', () => ({
  updateRipple: (edit: Record<string, unknown>) => {
    commits.push(edit);
    return Promise.resolve({ ok: true, rippleId: 'r' });
  },
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

import { InputSheet, type SheetContext } from '@/features/input-sheet/input-sheet';
import { LANE_SEARCH_THRESHOLD } from '@/features/input-sheet/lane-chips';
import type { SplashSummary } from '@/features/splash/summary';
import type { MyCategory } from '@/lib/queries/profile';

const TZ = 'America/Vancouver';
const TODAY = '2026-09-25';

function category(over: Partial<MyCategory>): MyCategory {
  return {
    id: 'c-place',
    user_id: 'a1',
    name: 'Place',
    icon: '📍',
    default_mode: 'drop',
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const LANES = [
  category({ id: 'c-place', name: 'Place', icon: '📍' }),
  category({ id: 'c-mood', name: 'Mood', icon: '🌤️' }),
  category({ id: 'c-day', name: 'Day', icon: '🖋' }),
];

// DORMANT (H21): the ripple sheet has no entry point since the refounding;
// the dormant focus screen hosts it for P3's Swim, so its test stays.
function board(over: Partial<SplashSummary>): SplashSummary {
  return {
    id: 's-free',
    title: 'During redesign',
    ghostTitle: null,
    description: null,
    declaredLaneId: null,
    icon: null,
    laneIds: ['c-day'],
    declaredRange: null,
    range: null,
    count: 1,
    blocks: [],
    latestCreatedAt: '2026-09-24T16:00:00Z',
    writtenOn: '2026-09-01',
    ownPoolId: null,
    open: true,
    createdAt: '2026-09-01T16:00:00Z',
    pinnedAt: null,
    sessionId: null,
    orphan: false,
    ...over,
  };
}

const BOARDS = [
  board({}),
  board({ id: 's-one', title: 'Whistler', declaredLaneId: 'c-place', laneIds: ['c-place'] }),
];

const context: SheetContext = { categories: LANES, splashes: BOARDS, timeZone: TZ, today: TODAY };

beforeEach(() => {
  commits.length = 0;
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
  window.URL.createObjectURL = () => 'blob:preview';
});
afterEach(cleanup);

function sheet(props: Partial<Parameters<typeof InputSheet>[0]> = {}) {
  return render(
    <InputSheet
      context={context}
      prefill={{}}
      onClose={() => {}}
      onCommitted={() => {}}
      {...props}
    />,
  );
}

function drop(view: ReturnType<typeof render>): HTMLButtonElement {
  return view.getByText('Drop') as HTMLButtonElement;
}

describe('what a valid commit is (SPEC 6)', () => {
  it('refuses nothing at all, and takes a note alone into the residual lane', async () => {
    const view = sheet();
    expect(drop(view).disabled).toBe(true);

    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'kitsilano beach' } });
    expect(drop(view).disabled).toBe(false);
    fireEvent.click(drop(view));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({
      note: 'kitsilano beach',
      categoryId: null,
      occurredOn: null,
      occurredTime: null,
      startInstant: null,
      endInstant: null,
      splashId: null,
    });
  });

  it('takes a chip alone: the zero-character diary', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('Mood'));
    expect(view.container.querySelector('[data-lane-badge]')!.textContent).toBe('🌤️');
    fireEvent.click(drop(view));

    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({ note: '', categoryId: 'c-mood' });
  });

  it('takes a photo alone', async () => {
    const view = sheet();
    const input = view.container.querySelector('[data-media-input]') as HTMLInputElement;
    const file = new File(['x'], 'beach.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() =>
      expect(view.container.querySelector('[data-media-previews] img')).not.toBeNull(),
    );
    expect(drop(view).disabled).toBe(false);
    fireEvent.click(drop(view));

    await waitFor(() => expect(commits).toHaveLength(1));
    // Stored under a fresh id and its type, never the file's own name (review).
    expect((commits[0].media as string[])[0]).toMatch(/^a1\/[0-9a-f-]{36}\.jpg$/);
    expect(commits[0].note).toBe('');
  });

  it('has no Timer, no audience chip, no mode toggle', () => {
    const { container } = sheet();
    expect(container.textContent).not.toMatch(/timer|everyone|only me/i);
    expect(container.querySelector('[aria-label="Start a timer"]')).toBeNull();
  });
});

describe('the annotation (H20c)', () => {
  it('is unset by default, and there is no now option', () => {
    const { getByText, container } = sheet();
    expect(getByText('+ Add Time')).toBeTruthy();
    expect(container.querySelector('[data-annotation-chip]')).toBeNull();
    expect(container.textContent).not.toMatch(/\bnow\b/i);
  });

  it('places the fragment on today as one editable chip: no Done, a clock only on request', () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    const chip = view.container.querySelector('[data-annotation-chip]')!;
    expect((view.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-09-25');
    expect(view.queryByText('Done')).toBeNull();
    expect(view.queryByLabelText('Time')).toBeNull();
    expect(chip.textContent).toContain('+ add time');
    // The end lives outside the chip.
    expect(chip.textContent).not.toContain('+ add end date');
    expect(view.getByText('+ add end date')).toBeTruthy();
  });

  it('sets a not-now time, and removes it back to a plain fragment', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-09-18' } });
    fireEvent.click(view.getByText('+ add time'));
    fireEvent.change(view.getByLabelText('Time'), { target: { value: '14:30' } });

    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'last week' } });
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({ occurredOn: '2026-09-18', occurredTime: '14:30' });
    expect(commits[0].startInstant).toBe('2026-09-18T21:30:00.000Z');
    expect(commits[0].endInstant).toBeNull();

    fireEvent.click(view.getByLabelText('Remove the time'));
    expect(view.container.querySelector('[data-annotation-chip]')).toBeNull();
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(2));
    expect(commits[1]).toMatchObject({ occurredOn: null, occurredTime: null, startInstant: null });
  });

  it('takes a date alone as a date-only fragment: a clock is never required', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-08-17' } });

    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'x' } });
    expect(drop(view).disabled).toBe(false);
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({
      occurredOn: '2026-08-17',
      occurredTime: null,
      startInstant: null,
      endInstant: null,
    });
  });

  it('spans by dates alone: an end date with no clock ends at the close of that day', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-08-17' } });
    fireEvent.click(view.getByText('+ add end date'));
    expect(view.queryByLabelText('End time')).toBeNull();
    fireEvent.change(view.getByLabelText('End date'), { target: { value: '2026-08-20' } });

    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'whistler' } });
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({
      occurredOn: '2026-08-17',
      occurredTime: null,
      startInstant: null,
      // 23:59 on Aug 20 in Vancouver.
      endInstant: '2026-08-21T06:59:00.000Z',
    });
  });

  it('treats a same-day end without clocks as no span, and an earlier one as backwards', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-08-17' } });
    fireEvent.click(view.getByText('+ add end date'));
    expect((view.getByLabelText('End date') as HTMLInputElement).value).toBe('2026-08-17');

    fireEvent.change(view.getByLabelText('End date'), { target: { value: '2026-08-16' } });
    expect(view.getByText('ends before it starts')).toBeTruthy();
    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'x' } });
    expect(drop(view).disabled).toBe(true);

    fireEvent.change(view.getByLabelText('End date'), { target: { value: '2026-08-17' } });
    expect(view.queryByText('ends before it starts')).toBeNull();
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({ occurredOn: '2026-08-17', endInstant: null });
  });

  it('validates a clocked span as end > start, and nothing else', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add Time'));
    fireEvent.click(view.getByText('+ add time'));
    fireEvent.change(view.getByLabelText('Time'), { target: { value: '19:00' } });
    fireEvent.click(view.getByText('+ add end date'));

    fireEvent.change(view.getByLabelText('End time'), { target: { value: '18:00' } });
    expect(view.getByText('ends before it starts')).toBeTruthy();
    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'dinner' } });
    expect(drop(view).disabled).toBe(true);

    fireEvent.change(view.getByLabelText('End time'), { target: { value: '21:00' } });
    expect(view.queryByText('ends before it starts')).toBeNull();
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(Date.parse(commits[0].endInstant as string)).toBeGreaterThan(
      Date.parse(commits[0].startInstant as string),
    );
  });
});

describe('a board in the sheet (H20d, H20e)', () => {
  it('hands the note being typed over to New splash', () => {
    const notes: string[] = [];
    const view = sheet({ onNewSplash: (note) => notes.push(note) });
    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'first words' } });
    fireEvent.click(view.getByText('+ Add to Splash'));
    fireEvent.click(view.getByText('+ New splash'));
    expect(notes).toEqual(['first words']);
  });

  it('attaches from the picker and detaches from the chip', async () => {
    const view = sheet();
    fireEvent.click(view.getByText('+ Add to Splash'));
    fireEvent.click(view.getByText('During redesign'));

    const chip = view.container.querySelector('[data-splash-chip]')!;
    expect(chip.textContent).toContain('During redesign');
    // The name in blue, not a chip, on a rule the name's width: the rule is
    // stretched to the shrink-wrapped name, never sized on its own.
    expect(chip.querySelector('span')!.className).toContain('text-main-900');
    expect(chip.className).not.toMatch(/border|rounded/);
    const rule = chip.querySelector('[data-splash-rule]')!;
    expect(rule.className).toContain('self-stretch');
    expect(rule.className).not.toMatch(/w-\d|w-\[/);
    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'x' } });
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({ splashId: 's-free' });

    fireEvent.click(view.getByLabelText('Remove from splash'));
    expect(view.container.querySelector('[data-splash-chip]')).toBeNull();
    expect(view.getByText('+ Add to Splash')).toBeTruthy();
  });

  it('presets the board when opened from +Drop', () => {
    const view = sheet({ prefill: { splashId: 's-free' } });
    expect(view.container.querySelector('[data-splash-chip]')!.textContent).toContain(
      'During redesign',
    );
  });

  it('a declared lane is where the selection starts, never a lock on it (H21f)', async () => {
    const view = sheet({ prefill: { splashId: 's-one' } });

    // The row stays the author's, and the badge shows the default.
    const row = view.getByRole('group', { name: 'Lane' });
    expect(row.textContent).toContain('Day');
    expect(view.container.querySelector('[data-lane-badge]')!.textContent).toBe('📍');

    fireEvent.change(view.getByLabelText('Note'), { target: { value: 'peak chair' } });
    fireEvent.click(drop(view));
    await waitFor(() => expect(commits).toHaveLength(1));
    expect(commits[0]).toMatchObject({ splashId: 's-one', categoryId: null });
  });
});

describe('the chip row (H20f)', () => {
  it('fills the selected chip with ink, never blue', () => {
    const view = sheet();
    fireEvent.click(view.getByText('Mood'));
    const chip = view.getByText('Mood').closest('button')!;

    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('bg-ink');
    expect(chip.className).toContain('text-white');
    expect(chip.className).not.toContain('bg-main-900');
    expect(view.getByText('Place').closest('button')!.className).not.toContain('bg-ink');
  });

  it('shows a search field only past the lane threshold, never on mere overflow', () => {
    const few = sheet();
    expect(few.queryByLabelText('Search')).toBeNull();
    cleanup();

    const many = Array.from({ length: LANE_SEARCH_THRESHOLD + 1 }, (_, i) =>
      category({ id: `c-${i}`, name: `Lane ${i}` }),
    );
    const view = sheet({ context: { ...context, categories: many } });
    expect(view.getByLabelText('Search')).toBeTruthy();

    fireEvent.change(view.getByLabelText('Search'), { target: { value: 'Lane 3' } });
    expect(view.getByRole('group', { name: 'Lane' }).textContent).toBe('📍Lane 3');
  });
});
