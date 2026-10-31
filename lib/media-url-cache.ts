import { signBoardPhotos, type SignedMedia } from '@/lib/media';
import { isStoragePath, type MediaVariant } from '@/lib/ripple-media';

/**
 * The browser's signed media URLs, one per (copy, path), kept until they near
 * their end (2026-10-30).
 *
 * A photo is loaded by its URL, and a new token is a new URL: the browser's
 * cache and the CDN's both missed, and a session fetched each photo about
 * three times as cards mounted and boards redrew. So the first URL a path
 * is handed is the one every later render draws, across reloads too
 * (localStorage), and the bytes come from the browser's own cache. The server
 * still decides who may see what: a path reaches this cache only from a row
 * the viewer's session read, or from a signing call that checked it.
 */

const STORAGE_KEY = 'weming.media-urls.v1';
/** A URL with less than this left is asked for again; the server reissues under a day. */
const STALE_BEFORE_MS = 20 * 60 * 60 * 1000;
/**
 * What a URL whose token says nothing has left, at least: the server never
 * hands one out with less than a day (lib/signed-media-objects.ts). Another
 * backend's URL (R2's presigned GET) carries no Supabase token.
 */
const ASSUMED_LEFT_MS = 24 * 60 * 60 * 1000;
/** Enough for months of boards; past it, the soonest to expire go first. */
const KEPT_MAX = 2000;

type Entry = { url: string; exp: number };

let entries: Map<string, Entry> | null = null;
/** Paths a signing call answered `null` for: placeholders, not asked again this session. */
const refused = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
let persistQueued = false;

function keyOf(variant: MediaVariant, path: string): string {
  return `${variant}:${path}`;
}

/** When a signed URL stops working, read from its token; `null` when it carries none. */
export function signedUrlExpiry(url: string): number | null {
  try {
    const token = new URL(url).searchParams.get('token');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function fresh(entry: Entry, now: number): boolean {
  return entry.exp - now > STALE_BEFORE_MS;
}

function load(): Map<string, Entry> {
  if (entries) return entries;
  entries = new Map();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
    const now = Date.now();
    for (const [key, entry] of Object.entries(stored)) {
      if (typeof entry?.url === 'string' && typeof entry.exp === 'number' && fresh(entry, now)) {
        entries.set(key, entry);
      }
    }
  } catch {
    // Storage blocked or full of something else: an in-memory cache still saves the session.
  }
  return entries;
}

function persist(): void {
  if (persistQueued) return;
  persistQueued = true;
  setTimeout(() => {
    persistQueued = false;
    const all = load();
    const now = Date.now();
    const kept = [...all].filter(([, entry]) => fresh(entry, now));
    kept.sort(([, a], [, b]) => b.exp - a.exp);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(kept.slice(0, KEPT_MAX))),
      );
    } catch {
      // Quota or a private window: the in-memory copy stands.
    }
  }, 0);
}

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`: anything learned redraws whoever reads. */
export function subscribeMediaUrls(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bumps on every change; `-1` is the server's render, which knows no cache. */
export function mediaUrlsVersion(): number {
  return version;
}

/** The URL kept for a path's copy, while it has time left. */
export function cachedMediaUrl(variant: MediaVariant, path: string): string | null {
  if (typeof window === 'undefined') return null;
  const entry = load().get(keyOf(variant, path));
  return entry && fresh(entry, Date.now()) ? entry.url : null;
}

/** `null` once a signing call could not sign the path this session. */
export function isRefusedMedia(variant: MediaVariant, path: string): boolean {
  return refused.has(keyOf(variant, path));
}

/**
 * Keeps what a server handed over. A path that already has a URL with time
 * left keeps that one, so the browser's copy still answers; an unsigned
 * (`null`) path is remembered as refused.
 */
export function rememberMediaUrls(variant: MediaVariant, urls: SignedMedia): void {
  if (typeof window === 'undefined') return;
  const all = load();
  const now = Date.now();
  let any = false;
  for (const [path, url] of Object.entries(urls)) {
    if (!isStoragePath(path)) continue;
    const key = keyOf(variant, path);
    if (url === null) {
      if (!refused.has(key)) {
        refused.add(key);
        any = true;
      }
      continue;
    }
    const held = all.get(key);
    if (held && fresh(held, now)) continue;
    const exp = signedUrlExpiry(url) ?? now + ASSUMED_LEFT_MS;
    if (!fresh({ url, exp }, now)) continue;
    all.set(key, { url, exp });
    refused.delete(key);
    any = true;
  }
  if (any) {
    persist();
    changed();
  }
}

/** On sign-out: the next person on this browser starts with nothing. */
export function clearMediaUrls(): void {
  entries = new Map();
  refused.clear();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept to clear.
  }
  changed();
}

type Ref = { rippleId: string; path: string };

/** What every hook mounted in this tick asked for, per copy, sent as one call. */
const queued = new Map<MediaVariant, Map<string, Ref>>();
const inFlight = new Set<string>();
let flushQueued = false;

/**
 * Asks the server for the paths not already kept, batched: every list and
 * card that mounts in the same tick shares one `signBoardPhotos` call.
 */
export function requestMediaUrls(variant: 'thumb' | 'display', refs: Ref[]): void {
  for (const ref of refs) {
    if (!isStoragePath(ref.path)) continue;
    const key = keyOf(variant, ref.path);
    if (inFlight.has(key) || refused.has(key) || cachedMediaUrl(variant, ref.path)) continue;
    inFlight.add(key);
    const forVariant = queued.get(variant) ?? new Map<string, Ref>();
    forVariant.set(ref.path, ref);
    queued.set(variant, forVariant);
  }
  if (queued.size === 0 || flushQueued) return;
  flushQueued = true;
  setTimeout(flush, 0);
}

function flush(): void {
  flushQueued = false;
  for (const [variant, refs] of queued) {
    const batch = [...refs.values()];
    const done = () => {
      for (const ref of batch) inFlight.delete(keyOf(variant, ref.path));
    };
    // A call that fails on the way (a timeout, a deploy) leaves placeholders,
    // and the next mount asks again.
    signBoardPhotos(batch, variant)
      .then((urls) => {
        done();
        rememberMediaUrls(variant, urls);
      })
      .catch((error: unknown) => {
        done();
        console.error('[during] photos not signed', error);
      });
  }
  queued.clear();
}
