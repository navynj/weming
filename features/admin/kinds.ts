/**
 * The dashboard's one order of kinds (H71): legends, stacked bars (bottom
 * to top), member tables and tooltips all read Splash, Ripple, Reply,
 * Reaction, then Opens. Plain data, no imports: the chart's client
 * component reads it too.
 */
export const WRITE_KIND_ORDER = ['splash', 'ripple', 'reply', 'reaction'] as const;
export type WriteKindName = (typeof WRITE_KIND_ORDER)[number];

export const KIND_LABEL: Record<WriteKindName | 'opens', string> = {
  splash: 'Splash',
  ripple: 'Ripple',
  reply: 'Reply',
  reaction: 'Reaction',
  opens: 'Opens',
};

/** Okabe–Ito, told apart with most colour vision. */
export const KIND_COLOR: Record<WriteKindName | 'opens', string> = {
  splash: '#0072B2',
  ripple: '#56B4E9',
  reply: '#009E73',
  reaction: '#E69F00',
  opens: '#CC79A7',
};

/** One colour per person, in join order; the admin is always this gray. */
export const PERSON_COLORS = [
  '#4E79A7',
  '#E15759',
  '#59A14F',
  '#B07AA1',
  '#F28E2B',
  '#76B7B2',
  '#9C755F',
  '#EDC948',
  '#FF9DA7',
];
export const ADMIN_COLOR = '#B8BECC';
