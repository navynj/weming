// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshed = vi.hoisted(() => ({ count: 0 }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/pool/P3TxKv9YLYpbrwUwiJ9ydE',
  useRouter: () => ({ refresh: () => (refreshed.count += 1) }),
}));
const captured = vi.hoisted(() => [] as unknown[]);
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...args: unknown[]) => captured.push(args) }));

import { PageSlot } from '@/features/auth/page-slot';

/**
 * The shell's page area, watched (features/auth/page-slot.tsx): nothing in
 * it for 3s is reported and read again once; nothing after that offers
 * Reload; anything drawn there puts it back. A local run reports to the
 * console (Sentry is off), which is what is read here.
 */
describe('a page area that draws nothing', () => {
  let warned: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    refreshed.count = 0;
    captured.length = 0;
    warned = [];
    vi.spyOn(console, 'warn').mockImplementation((line: string) => void warned.push(line));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is reported and refreshed after 3s, then offers Reload', () => {
    const { container } = render(<PageSlot>{null}</PageSlot>);
    act(() => void vi.advanceTimersByTime(2_900));
    expect(refreshed.count).toBe(0);
    act(() => void vi.advanceTimersByTime(200));
    expect(refreshed.count).toBe(1);
    expect(warned).toEqual(['[watchdog] Page rendered nothing for 3s at /pool/[id] (refresh)']);
    expect(container.ownerDocument.querySelector('[data-page-lost]')).toBeNull();

    act(() => void vi.advanceTimersByTime(3_000));
    expect(refreshed.count).toBe(1);
    expect(warned[1]).toBe(
      '[watchdog] Page still rendered nothing after a refresh, 6s at /pool/[id] (reload)',
    );
    const lost = container.ownerDocument.querySelector('[data-page-lost]')!;
    expect(lost.textContent).toContain('Something went wrong.');
    expect(lost.querySelector('button')!.textContent).toBe('Reload');
    // Sentry is off on a local run: nothing went to it.
    expect(captured).toEqual([]);
  });

  it('a page that draws is never reported', () => {
    render(
      <PageSlot>
        <main>A board</main>
      </PageSlot>,
    );
    act(() => void vi.advanceTimersByTime(30_000));
    expect(refreshed.count).toBe(0);
    expect(warned).toEqual([]);
  });

  it('drawing again takes the prompt away and re-arms the watch', async () => {
    const { container, rerender } = render(<PageSlot>{null}</PageSlot>);
    act(() => void vi.advanceTimersByTime(6_100));
    expect(container.ownerDocument.querySelector('[data-page-lost]')).not.toBeNull();
    rerender(
      <PageSlot>
        <main>A board</main>
      </PageSlot>,
    );
    // The observer's callback is a microtask.
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.ownerDocument.querySelector('[data-page-lost]')).toBeNull();
    rerender(<PageSlot>{null}</PageSlot>);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => void vi.advanceTimersByTime(3_100));
    // A new blank: a refresh again, not the prompt at once.
    expect(refreshed.count).toBe(2);
    expect(container.ownerDocument.querySelector('[data-page-lost]')).toBeNull();
  });
});
