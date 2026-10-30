// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signed = vi.hoisted(() => ({ asked: [] as { rippleId: string; path: string }[][] }));
vi.mock('@/lib/media', () => ({
  signBoardPhotos: () => Promise.resolve({}),
  signExportMedia: (photos: { rippleId: string; path: string }[]) => {
    signed.asked.push(photos);
    return Promise.resolve(
      Object.fromEntries(photos.map((p) => [p.path, `https://signed/${p.path}`])),
    );
  },
}));
vi.mock('modern-screenshot', () => ({
  domToBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
}));

import { ExportBoard } from '@/features/share-image/export-board';
import { inRange, shareRange } from '@/features/share-image/range';
import { redactForExport } from '@/features/share-image/redact';
import { ShareSheet } from '@/features/share-image/share-sheet';
import { PeopleProvider } from '@/features/people/people-provider';

import { ME, MINA, MY_PHOTOS, MY_VIDEO, SENTINELS, shareCards } from './share-fixtures';

const LANES = [{ id: 'c-day', name: 'Day', icon: '🌊' }];
const TODAY = '2026-10-28';

function people(children: React.ReactNode) {
  return (
    <PeopleProvider
      me={ME}
      people={{
        [ME]: { name: 'Yoonji Lee', photo: null },
        [MINA]: { name: 'Mina Kim', photo: null },
      }}
    >
      {children}
    </PeopleProvider>
  );
}

beforeEach(() => {
  signed.asked.length = 0;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png' }))),
  );
  URL.createObjectURL = vi.fn(() => 'blob:share');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function exported(span: 'week' | 'month', faces: boolean, placeName: string | null = null) {
  const range = shareRange(span, TODAY);
  const redacted = redactForExport(inRange(shareCards(), range), { faces });
  return render(
    people(
      <ExportBoard
        redacted={redacted}
        range={range}
        lanes={LANES}
        photos={MY_PHOTOS}
        placeName={placeName}
        onSettled={() => {}}
      />,
    ),
  );
}

describe('the shared image’s page (H63)', () => {
  it.each(['week', 'month'] as const)(
    'holds none of anyone else’s words, photos, names or faces, in any attribute (%s)',
    (span) => {
      const { container } = exported(span, false);
      const html = container.innerHTML;
      for (const s of SENTINELS) expect(html, s).not.toContain(s);
      // Every image on it is one of mine.
      const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
      for (const src of srcs) expect(Object.values(MY_PHOTOS)).toContain(src);
    },
  );

  it('draws my records with their titles and others’ as shapes, one each', () => {
    const { container } = exported('week', false);
    const text = container.textContent ?? '';
    expect(text).toContain('Morning swim');
    expect(text).toContain('Dinner at home');
    const shapes = new Set(
      [...container.querySelectorAll('[data-board-shape]')].map((el) =>
        el.getAttribute('data-board-shape'),
      ),
    );
    expect([...shapes].sort()).toEqual(['ranged', 'theirs', 'unflagged']);
    for (const el of container.querySelectorAll('[data-board-shape]')) {
      expect(el.textContent).toBe('');
    }
  });

  it('draws someone’s record I wrote on as my photo alone, with no words', () => {
    const { container } = exported('week', false);
    const piece = container.querySelector('[data-board-piece="joint"]')!;
    expect(piece).not.toBeNull();
    expect([...piece.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      MY_PHOTOS[`${ME}/side.webp`],
    ]);
    expect(piece.textContent?.trim()).toBe('');
  });

  it('is the week in two rows, Sun–Wed over Thu–Sat, the wordmark in the eighth cell', () => {
    const { container } = exported('week', false);
    const heads = [...container.querySelectorAll('[data-board-header]')].map((el) =>
      el.getAttribute('data-board-header'),
    );
    expect(heads).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    const mark = container.querySelector('[data-export-mark]');
    expect(mark?.textContent).toContain('Weming');
    expect(mark?.textContent).toContain('Pool your days.');
    expect(mark?.textContent).toContain('Oct 25 – 31');
  });

  it('is the month’s days, and none of the days around it carry a record', () => {
    const { container } = exported('month', false);
    expect(container.querySelector('h1')?.textContent).toBe('2026 OCT');
    expect(container.querySelector('[data-export-wordmark]')?.textContent).toContain('Weming');
  });

  it('wears the place’s ground: the water-ground, its colour from <html>', () => {
    document.documentElement.dataset.theme = 'pink';
    document.documentElement.dataset.mode = 'light';
    const { container } = exported('week', false);
    const root = container.querySelector('[data-export-board]');
    expect(root?.classList.contains('water-ground')).toBe(true);
    // Its own size, whatever the screen: 540×960, captured at twice that.
    expect((root as HTMLElement).style.width).toBe('540px');
    expect((root as HTMLElement).style.height).toBe('960px');
  });
});

describe('a video on my record (H63)', () => {
  function drawn(thumb: string | null) {
    const range = shareRange('week', TODAY);
    const redacted = redactForExport(inRange(shareCards(), range), { faces: false });
    return render(
      people(
        <ExportBoard
          redacted={redacted}
          range={range}
          lanes={LANES}
          photos={{ ...MY_PHOTOS, [`yt:${MY_VIDEO}`]: thumb }}
          placeName={null}
          onSettled={() => {}}
        />,
      ),
    );
  }
  const video = (container: HTMLElement): Element =>
    container.querySelector(`[data-board-photo-card="yt:${MY_VIDEO}"] [data-video-thumb]`)!;

  it('is its thumbnail with the play mark over it, so it reads as a video', () => {
    const { container } = drawn('data:image/jpeg;base64,VEhVTUI=');
    expect(video(container).querySelector('img')?.getAttribute('src')).toBe(
      'data:image/jpeg;base64,VEhVTUI=',
    );
    expect(video(container).querySelector('svg')).not.toBeNull();
  });

  it('is the plain tile with the play mark when its thumbnail could not be had', () => {
    const { container } = drawn(null);
    expect(video(container)).not.toBeNull();
    expect(video(container).querySelector('img')).toBeNull();
    expect(video(container).querySelector('svg')).not.toBeNull();
  });
});

describe('the share sheet (H63)', () => {
  function sheet(poolName: string | null) {
    return render(
      people(
        <ShareSheet
          cards={shareCards()}
          lanes={LANES}
          today={TODAY}
          poolName={poolName}
          onClose={() => {}}
        />,
      ),
    );
  }
  const stage = (): string => document.querySelector('[data-share-stage]')?.innerHTML ?? '';

  it('asks to sign my photos alone: no photo of anyone else is ever requested', async () => {
    sheet('SENTINEL-POOL');
    await waitFor(() => expect(signed.asked.length).toBeGreaterThan(0));
    const asked = signed.asked.flat();
    expect(asked.length).toBeGreaterThan(0);
    // My photos and my video, on my ripples — her record's too; never Mina's photo or video.
    expect(asked.map((p) => p.path).sort()).toEqual(
      [`${ME}/side.webp`, `${ME}/side.webp`, `${ME}/swim.webp`, `yt:${MY_VIDEO}`].sort(),
    );
    expect(asked.map((p) => p.rippleId).sort()).toEqual([
      'joint-me',
      'mine-1',
      'mine-1',
      'side-me',
    ]);
  });

  it('keeps the pool’s name and faces off until the switch, then shows the name', async () => {
    sheet('SENTINEL-POOL');
    await waitFor(() => expect(stage()).toContain('Morning swim'));
    expect(stage()).not.toContain('SENTINEL-POOL');
    fireEvent.click(document.querySelector('[role="switch"]')!);
    await waitFor(() => expect(stage()).toContain('SENTINEL-POOL'));
    // Her records stay shapes with the switch on.
    for (const s of ['SENTINEL-TITLE', 'SENTINEL-NOTE', 'SENTINEL-JOINT', `${MINA}/`]) {
      expect(stage()).not.toContain(s);
    }
  });

  it('shows the page’s outline, breathing, until the image is drawn', async () => {
    sheet(null);
    const preview = (): Element => document.querySelector('[data-share-preview]')!;
    expect(preview().getAttribute('data-share-preview')).toBe('drawing');
    const skeleton = preview().querySelector('[data-share-skeleton="week"]');
    expect(skeleton?.getAttribute('role')).toBe('status');
    // Still under reduced motion: the pulse is motion-safe only.
    expect(skeleton?.className).toContain('motion-safe:animate-pulse');
    await waitFor(() => expect(preview().getAttribute('data-share-preview')).toBe('ready'), {
      timeout: 3000,
    });
    expect(preview().querySelector('[data-share-skeleton]')).toBeNull();
  });

  it('offers no switch on Home', () => {
    sheet(null);
    expect(document.querySelector('[role="switch"]')).toBeNull();
  });

  it('shares the PNG through the share sheet once it is made', async () => {
    const share = vi.fn(async () => {});
    Object.assign(navigator, { share, canShare: () => true });
    sheet(null);
    const go = (): HTMLButtonElement => document.querySelector('[data-share-go]')!;
    await waitFor(() => expect(go().disabled).toBe(false), { timeout: 3000 });
    expect(go().textContent).toBe('Share');
    await act(async () => fireEvent.click(go()));
    expect(share).toHaveBeenCalledTimes(1);
    const file = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0];
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('weming-week-2026-10-25.png');
  });

  it('downloads it where there is no share sheet', async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    sheet(null);
    const go = (): HTMLButtonElement => document.querySelector('[data-share-go]')!;
    await waitFor(() => expect(go().disabled).toBe(false), { timeout: 3000 });
    expect(go().textContent).toBe('Download');
    await act(async () => fireEvent.click(go()));
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
