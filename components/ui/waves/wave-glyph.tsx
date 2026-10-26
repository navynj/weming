/**
 * The pill's wave glyph (review): one path, given exactly — two crests and
 * a trough on a 24 × 8 box, a 2px round stroke — drawn wherever a post's
 * mark or a day's count is a wave: the pill's ripple button and the
 * calendar's day headers. One path, so the two can never drift apart.
 */
export const WAVE_GLYPH_PATH = 'M1 6 C4 6 5 2 8 2 S12 6 15 6 S19 2 23 2';
export const WAVE_GLYPH_W = 24;
export const WAVE_GLYPH_H = 8;
const GLYPH_STROKE = 2;

export function WaveGlyph({
  width = WAVE_GLYPH_W,
  stroke = 'var(--wave-ink)',
  opacity,
  className = '',
}: {
  /** Drawn at this width; the height keeps the 24 × 8 proportion. */
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
        fill="none"
      />
    </svg>
  );
}
