import { fromShortId, isUuid, toShortId } from '@/lib/short-id';

/**
 * The URL layer of ids (H62): a link carries a record's short id, a route
 * reads either form back to the uuid every query keys by. Nothing stored
 * changes.
 */

/**
 * An id as a link carries it. Anything not a uuid passes as it is: render
 * fixtures name records 'p-ours', and a link must never throw.
 */
export function urlId(id: string): string {
  return isUuid(id) ? toShortId(id) : id;
}

/** No record has it, so it reads as one that is gone. */
const NO_RECORD = '00000000-0000-0000-0000-000000000000';

/**
 * A route segment as the uuid it names: a short id decoded, a uuid (an old
 * link, a shared invite's landing) as it is. Anything else is the uuid of no
 * record, so a malformed id and a missing one are the same not-found.
 */
export function idFromUrl(segment: string): string {
  if (isUuid(segment)) return segment.toLowerCase();
  return fromShortId(segment) ?? NO_RECORD;
}

export function splashPath(id: string): string {
  return `/splash/${urlId(id)}`;
}

export function lanePath(id: string): string {
  return `/lane/${urlId(id)}`;
}

export function poolPath(id: string): string {
  return `/pool/${urlId(id)}`;
}

export function poolSplashPath(poolId: string, splashId: string): string {
  return `${poolPath(poolId)}/splash/${urlId(splashId)}`;
}

export function poolLanePath(poolId: string, laneId: string): string {
  return `${poolPath(poolId)}/lane/${urlId(laneId)}`;
}

/** Segments whose next segment is an id. */
const KEYED = new Set(['pool', 'splash', 'lane']);

/**
 * The short-id spelling of a path that carries a uuid after pool, splash or
 * lane, for the proxy to redirect an old link to; null when it has none.
 * Says nothing about whether the record exists.
 */
export function canonicalPath(pathname: string): string | null {
  const segments = pathname.split('/');
  let changed = false;
  const out = segments.map((segment, i) => {
    if (i > 0 && KEYED.has(segments[i - 1]) && isUuid(segment)) {
      changed = true;
      return toShortId(segment);
    }
    return segment;
  });
  return changed ? out.join('/') : null;
}
