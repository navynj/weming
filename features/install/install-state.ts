'use client';

/**
 * Install prompts (H32), per device: Chromium's deferred install prompt,
 * captured as early as this module loads; whether this is the first visit
 * (never offered then); and a dismissal that hides the offer for 14 days.
 * Browser storage only, for per-device conveniences (CLAUDE.md); each read
 * and write survives storage that throws.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const FIRST_SEEN = 'weming.first-seen';
const DISMISSED = 'weming.install-dismissed-at';
const OFFER = 'weming:offer-install';
export const DISMISS_DAYS = 14;

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the offer simply comes back.
  }
}

/** Set before this document loaded, so this is not the first visit. */
let returning = false;

if (typeof window !== 'undefined') {
  const firstSeen = Number(read(FIRST_SEEN));
  returning = Number.isFinite(firstSeen) && firstSeen > 0 && firstSeen < performance.timeOrigin;
  if (!read(FIRST_SEEN)) write(FIRST_SEEN, String(Date.now()));
  window.addEventListener('beforeinstallprompt', (event) => {
    // Ours is the button (H32): the browser's own banner stays away.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Chromium has handed over its install prompt. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Chromium's install dialog, from our button. True when installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  changed();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

export function dismissInstall(now: number = Date.now()): void {
  write(DISMISSED, String(now));
}

/** Not on a first visit, and not within 14 days of a dismissal. */
export function mayOffer(now: number = Date.now()): boolean {
  if (!returning) return false;
  const at = Number(read(DISMISSED));
  return !(at > 0 && now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The first time I'm invited to add my side (H32): asks the shell's host to
 * show the offer, which decides whether there is anything to offer.
 */
export function offerInstall(): void {
  if (typeof window === 'undefined' || !mayOffer()) return;
  window.dispatchEvent(new Event(OFFER));
}

export function onOfferInstall(listener: () => void): () => void {
  window.addEventListener(OFFER, listener);
  return () => window.removeEventListener(OFFER, listener);
}
