import type { SampleLane, SampleSplash } from '@/features/auth/pool-block';

/**
 * The sign-in screen's pool: four lanes and a few splashes on them, drawn by
 * the grid Home uses. Static, never fetched: a picture of where records
 * gather, not anyone's records. Days are fixed, so the server and the
 * browser draw the same rows.
 */
export const SAMPLE_LANES: SampleLane[] = [
  { id: 'day', name: 'Day', icon: '☀️' },
  { id: 'food', name: 'Food', icon: '🍽️' },
  { id: 'place', name: 'Place', icon: '📍' },
  { id: 'music', name: 'Music', icon: '🎧' },
];

/** Newest first. Short titles: a lane on a phone here is about 64px wide. */
export const SAMPLE_SPLASHES: SampleSplash[] = [
  { id: 'sample-1', title: 'Sunrise', lane: 'day', day: '2026-10-12' },
  { id: 'sample-2', title: 'Ramen', lane: 'food', day: '2026-10-12' },
  { id: 'sample-3', title: 'Beach', lane: 'place', day: '2026-10-11' },
  { id: 'sample-4', title: 'Playlist', lane: 'music', day: '2026-10-11' },
  { id: 'sample-5', title: 'Walk', lane: 'day', day: '2026-10-10' },
  { id: 'sample-6', title: 'Brunch', lane: 'food', day: '2026-10-10' },
];
