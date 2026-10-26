// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
const saves: unknown[] = [];
vi.mock('@/features/people/actions', () => ({
  saveProfile: (input: unknown) => {
    saves.push(input);
    return Promise.resolve({ ok: true });
  },
}));
const uploads: { path: string; blob: Blob; contentType?: string }[] = [];
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (path: string, blob: Blob, options: { contentType?: string }) => {
          uploads.push({ path, blob, contentType: options.contentType });
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));

import { HomeGround } from '@/features/home/home-ground';
import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import {
  AVATAR_PX,
  clampView,
  encodeAvatar,
  sourceRect,
  UNSUPPORTED_PHOTO,
} from '@/features/people/crop';
import { PeopleProvider } from '@/features/people/people-provider';
import { RippleThread } from '@/features/splash/ripple-thread';
import type { Person } from '@/lib/queries/people';

const TZ = 'America/Vancouver';
const ME = 'u-me';
const MINA = 'u-mina';

/** Canvases drawn this test, with what they were encoded as. */
const drawn: { width: number; height: number; types: string[] }[] = [];
let encodesWebp = true;

function home(people: Record<string, Person>) {
  return render(
    <PeopleProvider me={ME} people={people}>
      <InputSheetProvider>
        <HomeGround
          cards={[]}
          pinned={[]}
          categories={[]}
          today="2026-10-23"
          timeZone={TZ}
          initials="YL"
          scrollToMonth={null}
          topParam={null}
          board="stair"
        />
        {/* Elsewhere a face is drawn: a thread with one ripple of mine and one of Mina's. */}
        <RippleThread
          initials="YL"
          authorId={ME}
          entries={[
            { id: 'r-me', body: 'mine' },
            { id: 'r-mina', body: 'hers', initials: 'MI', authorId: MINA },
          ]}
        />
      </InputSheetProvider>
    </PeopleProvider>,
  );
}

const avatar = (root: Element) => root.querySelector<HTMLElement>('[data-avatar]')!;
const thread = (root: Element, id: string) =>
  root.querySelector<HTMLElement>(`[data-thread-entry="${id}"] [data-thread-avatar]`)!;

beforeEach(() => {
  saves.length = 0;
  uploads.length = 0;
  drawn.length = 0;
  encodesWebp = true;
  window.localStorage.clear();
  // Board is the first view (review); my avatar sits on the Lane view's grid.
  window.localStorage.setItem('weming.home-view', 'lane');
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
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  // jsdom draws nothing: a canvas that records its size and the type asked for.
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    drawn.push({ width: this.width, height: this.height, types: [] });
    return {
      drawImage: () => {},
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toBlob = function toBlob(
    this: HTMLCanvasElement,
    done: BlobCallback,
    type?: string,
  ) {
    drawn.at(-1)?.types.push(type ?? '');
    // A browser that cannot encode WebP hands back a PNG instead.
    const made = type === 'image/webp' && !encodesWebp ? 'image/png' : (type ?? 'image/png');
    done(new Blob(['x'], { type: made }));
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // jsdom has no decode: each test that needs one says how it goes.
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
});

describe('the profile editor (0018)', () => {
  it('opens from my avatar on Home; Save waits for a change and a 1–40 character name', () => {
    const { container, getByLabelText } = home({ [ME]: { name: 'Yoonji Lee', photo: null } });
    fireEvent.click(avatar(container));
    const save = container.querySelector<HTMLButtonElement>('[data-profile-save]')!;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText('Name'), { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText('Name'), { target: { value: 'x'.repeat(41) } });
    expect(save.disabled).toBe(true);
    fireEvent.change(getByLabelText('Name'), { target: { value: 'Yoonji Kim' } });
    expect(save.disabled).toBe(false);
  });

  it('saving a name updates the initials everywhere at once, and saves it trimmed', async () => {
    const { container, getByLabelText } = home({ [ME]: { name: 'Yoonji Lee', photo: null } });
    expect(avatar(container).textContent).toBe('YL');
    expect(thread(container, 'r-me').textContent).toBe('YL');
    fireEvent.click(avatar(container));
    fireEvent.change(getByLabelText('Name'), { target: { value: '  Mina Park  ' } });
    fireEvent.click(container.querySelector('[data-profile-save]')!);
    await waitFor(() => expect(saves).toEqual([{ name: 'Mina Park', photo: 'keep' }]));
    expect(container.querySelector('[data-profile-sheet]')).toBeNull();
    expect(avatar(container).textContent).toBe('MP');
    expect(thread(container, 'r-me').textContent).toBe('MP');
    // Someone else's face is theirs still.
    expect(thread(container, 'r-mina').textContent).toBe('MI');
  });

  it('draws a photo wherever a person is shown, and Remove photo restores initials', async () => {
    const { container } = home({
      [ME]: { name: 'Yoonji Lee', photo: 'https://signed/me' },
      [MINA]: { name: 'Mina', photo: 'https://signed/mina' },
    });
    expect(avatar(container).querySelector('img')?.getAttribute('src')).toBe('https://signed/me');
    expect(thread(container, 'r-me').querySelector('img')?.getAttribute('src')).toBe(
      'https://signed/me',
    );
    expect(thread(container, 'r-mina').querySelector('img')?.getAttribute('src')).toBe(
      'https://signed/mina',
    );

    fireEvent.click(avatar(container));
    fireEvent.click(container.querySelector('[data-avatar-remove]')!);
    fireEvent.click(container.querySelector('[data-profile-save]')!);
    await waitFor(() => expect(saves).toEqual([{ name: 'Yoonji Lee', photo: 'remove' }]));
    expect(avatar(container).querySelector('img')).toBeNull();
    expect(avatar(container).textContent).toBe('YL');
    expect(thread(container, 'r-me').textContent).toBe('YL');
    expect(thread(container, 'r-mina').querySelector('img')).not.toBeNull();
  });

  it('uploads a picked photo as a 512px WebP to my own file, shown at once', async () => {
    HTMLImageElement.prototype.decode = () => Promise.resolve();
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(800);
    const { container } = home({ [ME]: { name: 'Yoonji Lee', photo: null } });
    fireEvent.click(avatar(container));
    const input = container.querySelector<HTMLInputElement>('[data-avatar-input]')!;
    expect(input.accept).toContain('image/heic');
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' })] },
      });
    });
    expect(container.querySelector('[data-crop-frame]')).not.toBeNull();
    fireEvent.click(container.querySelector('[data-profile-save]')!);
    await waitFor(() => expect(saves).toEqual([{ name: 'Yoonji Lee', photo: 'uploaded' }]));
    expect(drawn).toEqual([{ width: AVATAR_PX, height: AVATAR_PX, types: ['image/webp'] }]);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe(ME);
    expect(uploads[0].blob.type).toBe('image/webp');
    expect(uploads[0].contentType).toBe('image/webp');
    expect(avatar(container).querySelector('img')?.getAttribute('src')).toBe('blob:preview');
  });

  it('says so when the browser cannot decode the photo (HEIC outside Safari)', async () => {
    HTMLImageElement.prototype.decode = () => Promise.reject(new Error('EncodingError'));
    const { container, findByRole } = home({ [ME]: { name: 'Yoonji Lee', photo: null } });
    fireEvent.click(avatar(container));
    fireEvent.change(container.querySelector('[data-avatar-input]')!, {
      target: { files: [new File(['heic'], 'IMG_0002.HEIC', { type: 'image/heic' })] },
    });
    expect((await findByRole('alert')).textContent).toBe(UNSUPPORTED_PHOTO);
    expect(container.querySelector('[data-crop-frame]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-profile-save]')!.disabled).toBe(true);
  });
});

describe('the photo file (0018)', () => {
  it('falls back to JPEG where the browser cannot encode WebP', async () => {
    encodesWebp = false;
    const blob = await encodeAvatar(new Image(), { sx: 0, sy: 0, size: 100 });
    expect(blob.type).toBe('image/jpeg');
    expect(drawn[0]).toMatchObject({
      width: 512,
      height: 512,
      types: ['image/webp', 'image/jpeg'],
    });
  });

  it('crops the centred square at zoom 1, and never lets the frame show past an edge', () => {
    const image = { width: 1200, height: 800 };
    expect(sourceRect({ zoom: 1, x: 0, y: 0 }, image, 200)).toEqual({ sx: 200, sy: 0, size: 800 });
    // Dragged far right: the image's left edge stops at the frame's.
    expect(clampView({ zoom: 1, x: 999, y: 999 }, image, 200)).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(sourceRect({ zoom: 1, x: 999, y: 0 }, image, 200).sx).toBe(0);
    // Zoomed in twice: half the square.
    expect(sourceRect({ zoom: 2, x: 0, y: 0 }, image, 200).size).toBe(400);
  });
});
