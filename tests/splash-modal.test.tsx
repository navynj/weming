// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/splash/s1',
  useRouter: () => router,
}));

import { InputSheetProvider } from '@/features/input-sheet/sheet-provider';
import { SplashModal, useCloseSplash } from '@/features/splash/splash-modal';

/**
 * The splash detail as a bottom sheet (review): the screen it opened over
 * stays; back, Escape, the dimmed screen and a delete close it; a direct
 * visit closes to its context. Focus is held inside and given back.
 */
function Inside() {
  const close = useCloseSplash();
  return (
    <div data-splash-side>
      <button type="button">first</button>
      <input aria-label="note" />
      <button type="button" onClick={() => close?.()}>
        delete
      </button>
    </div>
  );
}

function sheet(closeTo: string | null) {
  return render(
    <InputSheetProvider>
      <button type="button" data-opener>
        opener
      </button>
      <SplashModal closeTo={closeTo}>
        <Inside />
      </SplashModal>
    </InputSheetProvider>,
  );
}

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockReset());
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
afterEach(() => {
  cleanup();
  // The exit copies a closed sheet leaves on the page while it animates out.
  document.body.querySelectorAll('[data-splash-leaving]').forEach((ghost) => ghost.remove());
});

describe('the splash sheet (review)', () => {
  it('opened in the app, closes back: by Escape, by the dimmed screen', async () => {
    const { container } = sheet(null);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1), { timeout: 3000 });
    cleanup();
    const again = sheet(null);
    fireEvent.click(again.container.querySelector('[data-sheet-scrim]')!);
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(container).toBeTruthy();
  });

  it('visited directly, closes to its context instead of leaving the app', async () => {
    const { getByText } = sheet('/?top=s1');
    // A delete inside closes it, as any close does.
    fireEvent.click(getByText('delete'));
    await waitFor(
      () => expect(router.replace).toHaveBeenCalledWith('/?top=s1', { scroll: false }),
      {
        timeout: 3000,
      },
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('leaves Escape to a field being written in', async () => {
    const { getByLabelText } = sheet(null);
    fireEvent.keyDown(getByLabelText('note'), { key: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('holds focus inside, and gives it back to what opened it', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const view = render(
      <InputSheetProvider>
        <SplashModal closeTo={null}>
          <Inside />
        </SplashModal>
      </InputSheetProvider>,
    );
    const dialog = view.container.querySelector('[data-splash-sheet]')!;
    expect(dialog.contains(document.activeElement) || document.activeElement === dialog).toBe(true);
    // Tab past the last control comes round to the first.
    const buttons = dialog.querySelectorAll('button');
    (buttons[buttons.length - 1] as HTMLButtonElement).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    act(() => {});
    expect(document.activeElement?.textContent).toBe('first');
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps the page behind from scrolling while open', () => {
    const view = sheet(null);
    expect(document.documentElement.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('fits its content up to 92dvh on a phone and 88dvh wide, min(1040px, 90vw) across, header pinned', () => {
    const { container } = sheet(null);
    const panel = container.querySelector('[data-splash-sheet]')!;
    expect(panel.className).toContain('max-h-[min(92dvh,var(--sheet-room))]');
    expect(panel.className).toContain('lg:max-h-[min(88dvh,var(--sheet-room))]');
    expect(panel.className).toContain('lg:w-[min(1040px,90vw)]');
    expect(panel.className).toContain('rounded-t-[32px]');
    // A fixed height would make short content a tall sheet.
    expect(panel.className.split(' ').some((c) => c.startsWith('h-['))).toBe(false);
    const body = container.querySelector('[data-sheet-body]')!;
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('[&_[data-splash-side]]:sticky');
    expect(container.querySelector('[data-sheet-handle]')).not.toBeNull();
  });
});

describe('deleting from inside the sheet (review)', () => {
  function Deleting({ gone }: { gone: boolean }) {
    return (
      <InputSheetProvider>
        <SplashModal closeTo={null}>{gone ? <p>This splash is gone.</p> : <Inside />}</SplashModal>
      </InputSheetProvider>
    );
  }

  it('keeps showing the splash while it closes, though the route re-reads it as gone', async () => {
    const view = render(<Deleting gone={false} />);
    fireEvent.click(view.getByText('delete'));
    // The delete's re-read lands while the sheet is still on its way out.
    view.rerender(<Deleting gone />);
    expect(view.queryByText('This splash is gone.')).toBeNull();
    expect(view.getByText('first')).toBeTruthy();
    await waitFor(() => expect(router.back).toHaveBeenCalled(), { timeout: 3000 });
  });
});
