/**
 * The pill's wave glyph (review): the exported SVG, as given — two crests
 * and a trough on a 17 × 4 box, a 1.5 round pen — drawn wherever a post's
 * mark or a day's count is a wave: the pill's ripple button and the
 * calendar's day headers. One path, so the two can never drift apart; the
 * pen scales with the glyph, as the export's does.
 */
export const WAVE_GLYPH_PATH =
  'M0.75 1.79321C2.02503 3.18416 3.30007 3.18416 4.5751 1.79321C5.85014 0.402263 7.12517 0.402263 8.40021 1.79321C9.67524 3.18416 10.9503 3.18416 12.2253 1.79321C13.5003 0.402263 14.7754 0.402263 16.0504 1.79321';
export const WAVE_GLYPH_W = 17;
export const WAVE_GLYPH_H = 4;
const GLYPH_STROKE = 1.5;

export function WaveGlyph({
  width = WAVE_GLYPH_W,
  stroke = 'var(--wave-ink)',
  opacity,
  className = '',
}: {
  /** Drawn at this width; the height (and the pen) keep the export's proportion. */
  width?: number;
  stroke?: string;
  opacity?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      data-wave-glyph
      width={width}
      height={(width / WAVE_GLYPH_W) * WAVE_GLYPH_H}
      viewBox={`0 0 ${WAVE_GLYPH_W} ${WAVE_GLYPH_H}`}
      fill="none"
      className={className}
    >
      <path
        d={WAVE_GLYPH_PATH}
        stroke={stroke}
        strokeOpacity={opacity}
        strokeWidth={GLYPH_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
