// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

// DORMANT (H20b): these surfaces have no entry point since the Splash pivot.
// The modules and this file stay for P3's Swim, rendered directly rather than
// through the retired day axis.
import { FocusScreen } from '@/features/focus/focus-screen';
import { NowBand } from '@/features/home-daily/now-band';
import { formatStopwatch } from '@/features/home-daily/use-elapsed';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import type { RippleWithSplash } from '@/lib/queries/ripples';
import { wallClockToInstant } from '@/lib/ripple-kind';
import { written } from './written-on';

const TZ = 'America/Vancouver';

beforeEach(() => {
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
});
afterEach(cleanup);

function ripple(over: Partial<RippleWithSplash> = {}): RippleWithSplash {
  return written({
    id: 'r1',
    author_id: 'a1',
    thread_pool_id: null,
    video_previews: true,
    note: 'session 2',
    media: [],
    occurred_on: '2026-09-19',
    occurred_time: '09:00:00',
    ended_at: wallClockToInstant('2026-09-19', '10:30', TZ).toISOString(),
    planned: false,
    participants: [],
    created_at: '2026-09-19T16:00:00.000Z',
    parent_ripple_id: null,
    splash_id: null,
    started_at: wallClockToInstant('2026-09-19', '09:00', TZ).toISOString(),
    ...over,
  });
}

function band(row: RippleWithSplash, openBreakId: string | null = null) {
  return render(
    <InputSheetProvider>
      <ol>
        <NowBand
          ripple={row}
          clock="09:00"
          elapsedMinutes={240}
          startedAt={row.started_at!}
          openBreakId={openBreakId}
        />
      </ol>
    </InputSheetProvider>,
  );
}

describe('the now band', () => {
  it('is still itself: only the water inside it moves (H15b)', () => {
    const { container } = band(ripple({ ended_at: null }));
    const surface = container.querySelector('.live-surface') as HTMLElement;

    // No animation on the band; the travelling class is on the waves only.
    expect(surface.className).not.toMatch(/animate|wave-travel/);
    expect(surface.querySelectorAll('path.wave-travel').length).toBeGreaterThan(0);
  });

  it('opens the focus screen when tapped, and stops from its own chip', () => {
    const { container, getByText } = band(ripple({ ended_at: null }));

    expect(container.querySelector('a[href="/now"]')).not.toBeNull();
    // Stop is outside that link, so an irreversible write never shares the
    // gesture that means "look closer" (H15d).
    const stop = getByText(/^Stop ·/);
    expect(stop.closest('a')).toBeNull();
  });

  it('asks before stopping', () => {
    const { getByText, queryByText } = band(ripple({ ended_at: null }));

    expect(queryByText('Stop now')).toBeNull();
    fireEvent.click(getByText(/^Stop ·/));
    expect(getByText('Stop now')).toBeTruthy();
    expect(getByText('Keep going')).toBeTruthy();
  });
});

describe('the focus screen', () => {
  const running = ripple({ ended_at: null });
  const startedAt = running.started_at!;

  function focus() {
    return render(<FocusScreen ripple={running} startedAt={startedAt} initialSeconds={1421} />);
  }

  it('is a live surface carrying white water', () => {
    const { container } = focus();
    const surface = container.querySelector('.live-surface');

    expect(surface).not.toBeNull();
    expect(surface!.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('shows the elapsed time at display size, and nothing that measures it', () => {
    const { getByText, container } = focus();

    expect(getByText('23:41')).toBeTruthy();
    // No goal, no percent, no progress bar (H15a): gauges and targets.
    expect(container.textContent).not.toMatch(/%|goal|target|progress/i);
    expect(container.querySelector('progress')).toBeNull();
  });

  it('offers no pause — there is no data model for one', () => {
    const { container } = focus();
    expect(container.textContent).not.toMatch(/pause/i);
  });

  it('carries the collapse control back to the day', () => {
    const { container } = focus();
    expect(container.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('files into the session it is showing, without leaving it', () => {
    const { getByLabelText, container } = focus();

    // A button, not a link: navigating away would unmount the surface and
    // stop the water (H15, item 3).
    const add = getByLabelText('Add to this session');
    expect(add.tagName).toBe('BUTTON');
    expect(container.querySelector('a[href^="/?session="]')).toBeNull();
  });

  it('stops behind a confirm, like the band', () => {
    const { getByLabelText, getByText } = focus();
    fireEvent.click(getByLabelText(/^Stop ·/));
    expect(getByText('Stop now')).toBeTruthy();
  });

  it('gives Stop the centre and Break a side', () => {
    const { getByLabelText } = focus();
    const stop = getByLabelText(/^Stop ·/);
    const brk = getByLabelText('Break');

    // Stop is the record-ending control, so it carries the size.
    expect(stop.className).toMatch(/h-24/);
    expect(brk.className).toMatch(/h-16/);
  });
});

describe('reduced motion', () => {
  it('freezes the water on both surfaces', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }),
    });

    const still = band(ripple({ ended_at: null }));
    expect(still.container.querySelectorAll('.wave-travel')).toHaveLength(0);
    // The band still reads: the surface and its waves are drawn, just still.
    expect(still.container.querySelector('.live-surface')).not.toBeNull();
    expect(still.container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});

describe('the stopwatch', () => {
  it('reads as minutes until an hour has passed, then as hours', () => {
    expect(formatStopwatch(1421)).toBe('23:41');
    expect(formatStopwatch(59)).toBe('00:59');
    expect(formatStopwatch(3661)).toBe('1:01:01');
  });
});

describe('a break, on the surfaces (H15a2)', () => {
  const running = ripple({ ended_at: null });

  it('says it is on a break on the band, and offers no net time', () => {
    const { container } = band(running, 'b1');

    expect(container.textContent).toContain('On a break');
    // The chip is the session's own gross time, never a remainder.
    expect(container.textContent).not.toMatch(/net|actual|effective/i);
  });

  it('stills the water on the focus screen rather than hiding it', () => {
    const onBreak = render(
      <FocusScreen
        ripple={running}
        startedAt={running.started_at!}
        initialSeconds={1421}
        openBreak="b1"
        breakStartedAt={running.started_at!}
        breakInitialSeconds={120}
      />,
    );

    // Law 2: rest is the same channel at its low value, so the waves stay.
    expect(onBreak.container.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(onBreak.container.querySelectorAll('.wave-travel')).toHaveLength(0);
    expect(onBreak.container.textContent).toContain('On a break');
  });

  it('says Break and Resume in words, with no pause glyph', () => {
    const idle = render(
      <FocusScreen ripple={running} startedAt={running.started_at!} initialSeconds={60} />,
    );
    // A pause icon would promise the clock stops, and ours does not (H15a2);
    // a droplet would collide with drop. Bubbles is rest while submerged.
    expect(idle.getByLabelText('Break').textContent).toBe('Break');
    expect(idle.container.querySelector('.lucide-pause')).toBeNull();
    expect(idle.container.querySelector('.lucide-droplet')).toBeNull();
    expect(idle.getByLabelText('Break').querySelector('.lucide-bubbles')).not.toBeNull();
    cleanup();

    const paused = render(
      <FocusScreen
        ripple={running}
        startedAt={running.started_at!}
        initialSeconds={60}
        openBreak="b1"
        breakStartedAt={running.started_at!}
        breakInitialSeconds={60}
      />,
    );
    expect(paused.getByLabelText('Resume').textContent).toBe('Resume');
    expect(paused.container.querySelector('.lucide-pause')).toBeNull();
    // Resume turns back from the break rather than repeating its glyph.
    expect(paused.getByLabelText('Resume').querySelector('.lucide-undo-2')).not.toBeNull();
    expect(paused.getByLabelText('Resume').querySelector('.lucide-bubbles')).toBeNull();
  });

  it('still shows the session clock, unpaused, during a break', () => {
    const { getByText } = render(
      <FocusScreen
        ripple={running}
        startedAt={running.started_at!}
        initialSeconds={1421}
        openBreak="b1"
        breakStartedAt={running.started_at!}
        breakInitialSeconds={120}
      />,
    );

    // The session's own clock never pauses; the break is recorded beside it.
    expect(getByText('23:41')).toBeTruthy();
  });
});
