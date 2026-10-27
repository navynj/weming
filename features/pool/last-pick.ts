/**
 * The pool lane I last picked in Audience for a (my lane, pool), on this
 * device (0033): a per-viewer convenience in localStorage. It only
 * preselects a chip; it never turns sharing on. Storage may be missing or
 * refuse (a private window): then nothing is remembered.
 */
const KEY = 'weming.audience.lastPick';

function readAll(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const keyOf = (myLaneId: string | null, poolId: string): string => `${myLaneId ?? '-'}:${poolId}`;

export function lastPicked(myLaneId: string | null, poolId: string): string | null {
  if (typeof window === 'undefined') return null;
  return readAll()[keyOf(myLaneId, poolId)] ?? null;
}

export function rememberPick(myLaneId: string | null, poolId: string, poolLaneId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const all = readAll();
    all[keyOf(myLaneId, poolId)] = poolLaneId;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Not remembered: the next record starts with no chip, as on a new device.
  }
}
