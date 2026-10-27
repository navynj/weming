import type { LinkMarkers } from './links';

/** A pool lane as Connect your lanes lists it. */
export type MatchLane = {
  key: string;
  name: string;
  icon: string | null;
  description: string | null;
};

/** Which of my lanes each pool lane takes; null is "Don't connect". */
export type Links = Record<string, string | null>;

/** Each connected row's markers (0033), by pool lane key. */
export type Markers = Record<string, LinkMarkers>;

export function linkedCount(links: Links): number {
  return Object.values(links).filter((id) => id !== null).length;
}

/**
 * The markers as they will be saved (0033): each lane of mine connected here
 * has one default row — the one marked, else its first — and only that row
 * may share by default. Home is per row. A row not connected has none.
 */
export function settleMarkers(keys: string[], links: Links, markers: Markers): Markers {
  const settled: Markers = {};
  const defaultOf = new Map<string, string>();
  for (const key of keys) {
    const mine = links[key];
    if (mine && markers[key]?.isDefault && !defaultOf.has(mine)) defaultOf.set(mine, key);
  }
  for (const key of keys) {
    const mine = links[key];
    if (mine && !defaultOf.has(mine)) defaultOf.set(mine, key);
  }
  for (const key of keys) {
    const mine = links[key];
    if (!mine) continue;
    const isDefault = defaultOf.get(mine) === key;
    settled[key] = {
      isDefault,
      shareByDefault: isDefault && Boolean(markers[key]?.shareByDefault),
      isHome: Boolean(markers[key]?.isHome),
    };
  }
  return settled;
}

/** The other rows connecting the same lane of mine: a default is chosen among them. */
export function siblings(key: string, keys: string[], links: Links): string[] {
  const mine = links[key];
  return mine ? keys.filter((other) => links[other] === mine) : [];
}
