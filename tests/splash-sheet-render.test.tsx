// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drops: Record<string, unknown>[] = [];
vi.mock('@/features/splash/actions', () => ({
  dropSplash: (input: Record<string, unknown>) => {
    drops.push(input);
    return Promise.resolve({ ok: true, splash: { id: 's-new', title: input.title } });
  },
}));
const placed: { splashId: string; pools: string[] }[] = [];
const joints: Record<string, unknown>[] = [];
const owns: Record<string, unknown>[] = [];
vi.mock('@/features/pool/actions', () => ({
  placeNewSplash: (splashId: string, pools: string[]) => {
    placed.push({ splashId, pools });
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
  usePathname: () => pathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock('@/lib/downscale', () => ({ downscale: (file: File) => Promise.resolve(file) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'a1' } } }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  }),
}));

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
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
/** Place and Mood are linked in both pools; Day is linked nowhere (H23). */
const POOLS = [
  { id: 'p-ours', name: 'Our Pool' },
  { id: 'p-crew', name: 'Crew' },
];
const LINKS = [
  { myCategoryId: 'c-place', poolId: 'p-ours', poolName: 'Our Pool' },
  { myCategoryId: 'c-place', poolId: 'p-crew', poolName: 'Crew' },
  { myCategoryId: 'c-mood', poolId: 'p-ours', poolName: 'Our Pool' },
  { myCategoryId: 'c-mood', poolId: 'p-crew', poolName: 'Crew' },
];

beforeEach(() => {
  drops.length = 0;
  placed.length = 0;
  joints.length = 0;
  owns.length = 0;
  handoffs.length = 0;
  window.URL.createObjectURL = () => 'blob:preview';
});
afterEach(cleanup);

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
        links: LINKS,
        pools: POOLS,
        initials: 'YL',
      }}
      onClose={() => {}}
      onDrop={onDrop}
    />,
  );
  return { ...view, onDrop, drop: () => view.getByText('Drop') as HTMLButtonElement };
}

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

describe('the Audience chip (H23)', () => {
  const chip = (view: ReturnType<typeof sheet>) =>
    view.container.querySelector('[data-audience-chip]') as HTMLButtonElement;

  it('defaults to every pool where the chosen lane is linked, and says so', () => {
    const view = sheet();
    expect(chip(view).textContent).toBe('Only me');
    fireEvent.click(view.getByText('Place'));
    expect(chip(view).textContent).toBe('2 pools');
    fireEvent.click(view.getByText('Day'));
    expect(chip(view).textContent).toBe('Only me');
  });

  it('keeps an audience edited by hand when the lane changes', () => {
    const view = sheet();
    fireEvent.click(view.getByText('Place'));
    fireEvent.click(chip(view));
    fireEvent.click(view.getByRole('switch', { name: 'Shared to Crew' }));
    // The sheet stays open over the composer; the chip already reads the edit.
    expect(chip(view).textContent).toBe('Our Pool');
    fireEvent.click(view.getAllByText('Mood')[0]);
    expect(chip(view).textContent).toBe('Our Pool');
  });

  it('places the dropped post where the chip says', async () => {
    const view = sheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Twin Falls' } });
    fireEvent.click(view.getByText('Place'));
    fireEvent.click(view.drop());
    await waitFor(() => expect(placed).toHaveLength(1));
    expect(placed[0].pools.sort()).toEqual(['p-crew', 'p-ours']);
  });
});

describe('compose from a pool (H23)', () => {
  // Our Pool's lanes: Trips is linked to my Place, Notes to nothing.
  const SCOPE = {
    poolId: 'p-ours',
    poolName: 'Our Pool',
    lanes: [
      {
        id: 'pl-trips',
        name: 'Trips',
        icon: '🏕',
        myCategoryId: 'c-place',
        direction: 'both' as const,
      },
      { id: 'pl-notes', name: 'Notes', icon: '📓', myCategoryId: null, direction: null },
      // Linked out only: my Mood shares into Moods, nothing comes back (0017).
      {
        id: 'pl-moods',
        name: 'Moods',
        icon: '🌤️',
        myCategoryId: 'c-mood',
        direction: 'out' as const,
      },
    ],
  };
  function poolSheet() {
    const onDrop = vi.fn((drop: DropHandoff) => void drop.commit());
    const view = render(
      <InputSheetProvider>
        <SplashSheet
          context={{
            categories: LANES,
            timeZone: TZ,
            today: TODAY,
            links: LINKS,
            pools: POOLS,
            initials: 'YL',
          }}
          pool={SCOPE}
          onClose={() => {}}
          onDrop={onDrop}
        />
      </InputSheetProvider>,
    );
    return { ...view, onDrop, drop: () => view.getByText('Drop') as HTMLButtonElement };
  }

  it('opens on Pool lanes and drops a joint splash on the chosen pool lane', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Rematch Friday' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-trips"]')!);
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    // The splash carries the pool lane and the date; my ripple carries no
    // lane (H24) — the link decides where it shows on my Home. Nothing placed.
    expect(joints[0]).toMatchObject({
      poolId: 'p-ours',
      poolLaneId: 'pl-trips',
      declaredStart: TODAY,
    });
    expect(joints[0]).not.toHaveProperty('myCategoryId');
    expect(placed).toEqual([]);
  });

  it('makes Just mine on a linked pool lane my splash in my linked lane, placed here', async () => {
    const view = poolSheet();
    fireEvent.click(view.getByRole('switch', { name: 'Just mine' }));
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Twin Falls' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-trips"]')!);
    fireEvent.click(view.drop());
    await waitFor(() => expect(placed).toHaveLength(1));
    expect(drops[0]).toMatchObject({ declaredLaneId: 'c-place' });
    expect(placed[0].pools).toEqual(['p-ours']);
    expect(joints).toEqual([]);
  });

  it('drops a joint ripple with no lane on a pool lane linked ← out only', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'grey day' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-moods"]')!);
    expect(view.container.querySelector('[data-landing-hint]')!.textContent).toBe(
      'Joint · pool only',
    );
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ poolLaneId: 'pl-moods' });
    expect(joints[0]).not.toHaveProperty('myCategoryId');
  });

  it('makes Just mine on an out-only lane a Just-mine splash with no lane', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'mine only' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-moods"]')!);
    fireEvent.click(view.getByRole('switch', { name: 'Just mine' }));
    expect(view.container.querySelector('[data-landing-hint]')!.textContent).toBe(
      'Yours · pool only',
    );
    fireEvent.click(view.drop());
    await waitFor(() => expect(owns).toHaveLength(1));
    expect(owns[0]).toMatchObject({ poolLaneId: 'pl-moods' });
  });

  it('says where it lands under the chosen chip', () => {
    const view = poolSheet();
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-trips"]')!);
    expect(view.container.querySelector('[data-landing-hint]')!.textContent).toBe(
      'Joint · your Place lane',
    );
    fireEvent.click(view.getByRole('switch', { name: 'Just mine' }));
    expect(view.container.querySelector('[data-landing-hint]')!.textContent).toBe(
      'Yours · Place lane',
    );
  });

  it('shows the pool’s lanes alone: no My lanes tab', () => {
    const view = poolSheet();
    expect(view.queryByRole('tab', { name: 'My lanes' })).toBeNull();
    expect(view.container.querySelectorAll('[data-pick-pool-lane]')).toHaveLength(3);
  });

  it('has no Audience chip', () => {
    const view = poolSheet();
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
    fireEvent.click(view.getByRole('switch', { name: 'Just mine' }));
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-trips"]')!);
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
  });

  it('drops a joint ripple on an unlinked pool lane with no lane of mine, asking nothing', async () => {
    const view = poolSheet();
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'Chapter 3' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-notes"]')!);
    expect(view.queryByText('Not linked to your lanes')).toBeNull();
    expect(view.container.querySelector('[data-link-it]')).toBeNull();
    fireEvent.click(view.drop());
    await waitFor(() => expect(joints).toHaveLength(1));
    expect(joints[0]).toMatchObject({ poolLaneId: 'pl-notes' });
    expect(joints[0]).not.toHaveProperty('myCategoryId');
  });

  it('renders one filled row — the lane chips — and no link row', () => {
    const view = poolSheet();
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-trips"]')!);
    const filled = [...view.container.querySelectorAll('[data-pool-lane-picker] .bg-ink')];
    // Only the chosen lane chip is filled in ink.
    expect(filled.map((el) => el.getAttribute('data-pick-pool-lane'))).toEqual(['pl-trips']);
    expect(view.container.querySelector('[data-joint-unlinked]')).toBeNull();
  });
});

describe('Just mine from a pool (0014)', () => {
  it('offers Everyone’s | Just mine once a pool lane is picked, and Just mine needs no lane of mine', async () => {
    const view = render(
      <InputSheetProvider>
        <SplashSheet
          context={{
            categories: LANES,
            timeZone: TZ,
            today: TODAY,
            links: LINKS,
            pools: POOLS,
            initials: 'YL',
          }}
          pool={{
            poolId: 'p-ours',
            poolName: 'Our Pool',
            lanes: [
              { id: 'pl-notes', name: 'Notes', icon: '📓', myCategoryId: null, direction: null },
            ],
          }}
          onClose={() => {}}
          onDrop={(drop) => void drop.commit()}
        />
      </InputSheetProvider>,
    );
    // One switch at the tabs' right end, off (everyone's) by default.
    const justMine = view.getByRole('switch', { name: 'Just mine' });
    expect(justMine.getAttribute('aria-checked')).toBe('false');
    fireEvent.change(view.getByLabelText('Content'), { target: { value: 'my notes' } });
    fireEvent.click(view.container.querySelector('[data-pick-pool-lane="pl-notes"]')!);
    fireEvent.click(justMine);
    expect(justMine.getAttribute('aria-checked')).toBe('true');
    // No lane of mine asked for, no link offered, no audience.
    expect(view.queryByText('Not linked to your lanes')).toBeNull();
    expect(view.container.querySelector('[data-audience-chip]')).toBeNull();
    fireEvent.click(view.getByText('Drop'));
    await waitFor(() => expect(owns).toHaveLength(1));
    expect(owns[0]).toMatchObject({ poolId: 'p-ours', poolLaneId: 'pl-notes', body: 'my notes' });
    expect(joints).toEqual([]);
  });
});
