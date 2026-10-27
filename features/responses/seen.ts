'use client';

import { useSyncExternalStore } from 'react';

/**
 * Per device (H24), as the pool dots are (features/pool/remembered.ts): when
 * I last opened each splash, so a ripple of mine with reactions or replies
 * newer than that carries a dot beside its avatar until I open it. Browser
 * storage only — a convenience, never a record — so every read and write
 * survives storage being unavailable.
 */
const SEEN = 'weming.response-seen';
const SEEN_EVENT = 'weming:response-seen';

/** What each splash's last open was before this one, in this tab: the open page's dots. */
const before = new Map<string, string | null>();

function read(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SEEN) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Opening a splash: seen as of now. Its page keeps the dots it opened with. */
export function rememberSeen(splashId: string, at: Date = new Date()): void {
  const all = read();
  if (!before.has(splashId)) before.set(splashId, all[splashId] ?? null);
  try {
    window.localStorage.setItem(SEEN, JSON.stringify({ ...all, [splashId]: at.toISOString() }));
  } catch {
    // Not remembered on this device, then.
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

function raw(): string {
  try {
    return window.localStorage.getItem(SEEN) ?? '';
  } catch {
    return '';
  }
}

/**
 * When I last opened each splash on this device — or null on the server and
 * during hydration, which cannot know this device: no dot renders until the
 * browser has it.
 */
export function useSeen(): Record<string, string> | null {
  const value = useSyncExternalStore(subscribe, raw, () => null);
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** On the open page: what the last open was before this one (undefined until the page remembers it). */
export function useSeenBefore(splashId: string): string | null | undefined {
  // Re-read when the page remembers the open, which fills `before`.
  useSeen();
  return before.has(splashId) ? before.get(splashId)! : undefined;
}

/** A dot: something from someone else newer than the last open; never opened counts as new. */
export function isUnseen(latest: string | undefined, seenAt: string | null | undefined): boolean {
  if (!latest || seenAt === undefined) return false;
  return seenAt === null || latest > seenAt;
}
