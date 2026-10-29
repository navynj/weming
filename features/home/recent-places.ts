'use client';

/**
 * The places I went last on this device — Home (`/`) and pools
 * (`/pool/<id>`), newest first — so the strip prefetches in full only the
 * two I am likeliest to go back to (the 2026-10-28 storm: every place,
 * re-prefetched on every invalidation). Browser storage only, a
 * convenience: unavailable storage just means nothing is remembered.
 */
const KEY = 'weming.recent-places';
const KEEP = 3;

export function recentPlaces(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPlace(href: string): void {
  try {
    const next = [href, ...recentPlaces().filter((p) => p !== href)].slice(0, KEEP);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not remembered on this device, then.
  }
}

/**
 * The places to prefetch in full from `here`: the two I went to last, other
 * than where I am, among those on the strip; filled from the strip's own
 * order (Home, then the pool I opened last) while there is no history yet.
 */
export function placesToWarm(here: string | null, strip: string[], recent: string[]): string[] {
  const candidates = [...recent, ...strip].filter((href) => href !== here && strip.includes(href));
  return [...new Set(candidates)].slice(0, 2);
}
