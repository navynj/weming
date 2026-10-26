'use client';

import { useSyncExternalStore } from 'react';

import type { PoolViewKind } from './pool-cards';

/**
 * Per device (H23): the pool I looked at last, when I last visited each
 * pool (for the switcher's "new since my last visit" dot), and the view the
 * pool shows. Browser storage only — a convenience, never a record — so
 * every read and write survives storage being unavailable.
 */
const LAST_POOL = 'weming.last-pool';
const VISITS = 'weming.pool-visits';
const VIEW = 'weming.pool-view';
const EVENT = 'weming:pool-view';
const VISIT_EVENT = 'weming:pool-visit';

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
    // Not remembered on this device, then.
  }
}

export function lastPool(): string | null {
  return read(LAST_POOL);
}

function visits(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(read(VISITS) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Opening a pool: it becomes the one the Pool tab opens, and it is seen as of now. */
export function rememberVisit(poolId: string, at: Date = new Date()): void {
  write(LAST_POOL, poolId);
  write(VISITS, JSON.stringify({ ...visits(), [poolId]: at.toISOString() }));
  // The dots clear the moment a pool is opened.
  window.dispatchEvent(new Event(VISIT_EVENT));
}

function subscribeVisits(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(VISIT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(VISIT_EVENT, onChange);
  };
}

/**
 * When I last opened each pool on this device, by id — or null on the server
 * and during hydration, which cannot know this device: nothing that depends
 * on it may render until the browser has it (a dot drawn by the server and
 * taken away by the client is a hydration mismatch).
 */
export function usePoolVisits(): Record<string, string> | null {
  const raw = useSyncExternalStore(
    subscribeVisits,
    () => read(VISITS) ?? '',
    () => null,
  );
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Something new since my last visit on this device; never-visited counts as new when anything is there. */
export function isNewSince(poolId: string, latestActivity: string | null): boolean {
  if (!latestActivity) return false;
  const seen = visits()[poolId];
  return !seen || latestActivity > seen;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function readView(): PoolViewKind {
  const value = read(VIEW);
  return value === 'date' || value === 'lane' || value === 'swimmers' ? value : 'board';
}

/** The view every pool shows, kept when switching pools (H23); Board first (review). */
export function usePoolView(): [PoolViewKind, (view: PoolViewKind) => void] {
  const view = useSyncExternalStore(subscribe, readView, () => 'board' as const);
  const set = (next: PoolViewKind): void => {
    write(VIEW, next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [view, set];
}
