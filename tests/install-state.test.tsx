// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The install offer's rules (H32), per device: never on a first visit,
 * hidden for 14 days once dismissed, and our own button for Chromium's
 * prompt. The module reads the device at import, so each case imports anew.
 */
const DAY = 24 * 60 * 60 * 1000;

async function load() {
  vi.resetModules();
  return import('@/features/install/install-state');
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('when the install offer may show', () => {
  it('never on a first visit', async () => {
    const state = await load();
    expect(state.mayOffer()).toBe(false);
    expect(window.localStorage.getItem('weming.first-seen')).not.toBeNull();
  });

  it('on a later visit, until dismissed, and again after 14 days', async () => {
    window.localStorage.setItem('weming.first-seen', String(performance.timeOrigin - DAY));
    const state = await load();
    const now = Date.now();
    expect(state.mayOffer(now)).toBe(true);
    state.dismissInstall(now);
    expect(state.mayOffer(now + 13 * DAY)).toBe(false);
    expect(state.mayOffer(now + 14 * DAY + 1)).toBe(true);
  });

  it('asks the host only when it may', async () => {
    const raised: number[] = [];
    let state = await load();
    let off = state.onOfferInstall(() => raised.push(1));
    state.offerInstall();
    expect(raised).toEqual([]);
    off();

    window.localStorage.setItem('weming.first-seen', String(performance.timeOrigin - DAY));
    state = await load();
    off = state.onOfferInstall(() => raised.push(1));
    state.offerInstall();
    expect(raised).toEqual([1]);
    off();
  });
});

describe('Chromium’s install prompt', () => {
  it('is held for our button, and the browser’s banner kept away', async () => {
    const state = await load();
    expect(state.canPromptInstall()).toBe(false);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(state.canPromptInstall()).toBe(true);
    expect(await state.promptInstall()).toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(state.canPromptInstall()).toBe(false);
  });
});
