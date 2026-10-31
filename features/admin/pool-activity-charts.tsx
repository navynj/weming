'use client';

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { KIND_COLOR, KIND_LABEL, WRITE_KIND_ORDER } from './kinds';

/**
 * A pool's activity, drawn (H71). The server reads and counts; this gets
 * the counts alone — per member and day, a name and a colour, no id — and
 * draws them in plain SVG, with one hover shared by every chart: a day's
 * column shows a guide and a table of who did what that day.
 *
 * Mirrors lib/admin/daily.ts's ChartData; restated here so this file
 * imports nothing but React and the kinds.
 */
type DayCounts = [number, number, number, number, number];
type Member = {
  name: string;
  color: string;
  isAdmin: boolean;
  joinedIndex: number;
  counts: DayCounts[];
};
export type PoolActivityData = {
  days: string[];
  members: Member[];
  trackingStartIndex: number | null;
};

const LEFT = 140;
const RIGHT = 16;
const MIN_DAY_W = 34;
const LINE_H = 220;
const LINE_TOP = 22;
const AXIS_H = 22;
const OPENS_ROW_H = 14;
const BAR_H = 44;
const BAR_GAP = 14;
const MUTED = '#6B79A3';
const FAINT = '#D8DCE8';

const writes = (c: DayCounts): number => c[0] + c[1] + c[2] + c[3];

type Hover = { day: number; x: number; y: number };

export function PoolActivityCharts({ data }: { data: PoolActivityData }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const el = box.current;
    // Without one, the chart keeps its default width and scrolls.
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { days, members, trackingStartIndex } = data;
  const dayW = Math.max(MIN_DAY_W, (width - LEFT - RIGHT) / Math.max(days.length, 1));
  const plotW = days.length * dayW;
  const svgW = LEFT + plotW + RIGHT;
  const cx = (i: number): number => LEFT + i * dayW + dayW / 2;
  // One scale for the lines and every small multiple, so they compare.
  const yMax = Math.max(
    1,
    ...members.flatMap((m) => m.counts.map((c, i) => (i >= m.joinedIndex ? writes(c) : 0))),
  );
  // The admin first, so everyone else is drawn over them.
  const drawOrder = [...members].sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin));

  const track = (day: number) => ({
    onPointerEnter: (e: PointerEvent) => setHover({ day, x: e.clientX, y: e.clientY }),
    onPointerMove: (e: PointerEvent) => setHover({ day, x: e.clientX, y: e.clientY }),
  });

  /** A transparent column per day over a chart's full height: the hover's target. */
  const columns = (height: number): ReactNode =>
    days.map((d, i) => (
      <rect
        key={d}
        x={LEFT + i * dayW}
        y={0}
        width={dayW}
        height={height}
        fill="transparent"
        {...track(i)}
      />
    ));

  const guide = (height: number): ReactNode =>
    hover ? (
      <line
        x1={cx(hover.day)}
        x2={cx(hover.day)}
        y1={0}
        y2={height}
        stroke="#161621"
        strokeOpacity={0.35}
        pointerEvents="none"
      />
    ) : null;

  /** Each member's join, and where opens start being recorded. */
  const marks = (top: number, bottom: number): ReactNode => (
    <g pointerEvents="none">
      {members.map((m) =>
        m.joinedIndex > 0 ? (
          <line
            key={`join-${m.name}-${m.joinedIndex}`}
            x1={LEFT + m.joinedIndex * dayW}
            x2={LEFT + m.joinedIndex * dayW}
            y1={top}
            y2={bottom}
            stroke={m.color}
            strokeOpacity={0.45}
            strokeDasharray="2 3"
          />
        ) : null,
      )}
      {trackingStartIndex !== null ? (
        <line
          x1={LEFT + trackingStartIndex * dayW}
          x2={LEFT + trackingStartIndex * dayW}
          y1={top}
          y2={bottom}
          stroke={MUTED}
          strokeOpacity={0.5}
          strokeDasharray="5 3"
        />
      ) : null}
    </g>
  );

  const dayLabels = (y: number): ReactNode =>
    days.map((d, i) => (
      <text
        key={d}
        x={cx(i)}
        y={y}
        fontSize={10}
        textAnchor="middle"
        fill={i === days.length - 1 ? '#161621' : MUTED}
        fontWeight={i === days.length - 1 || hover?.day === i ? 600 : 400}
        pointerEvents="none"
      >
        {d.slice(5)}
      </text>
    ));

  // --- the line chart, with the opens rows under its axis ---------------
  const lineY = (n: number): number => LINE_TOP + LINE_H - (n / yMax) * LINE_H;
  const axisY = LINE_TOP + LINE_H;
  const opensTop = axisY + AXIS_H + 18;
  const mainH = opensTop + members.length * OPENS_ROW_H + 6;
  const ticks = [...new Set([0, Math.round(yMax / 2), yMax])];

  // --- the small multiples ------------------------------------------------
  const barW = Math.min(dayW * 0.6, 18);
  const multH = members.length * (BAR_H + BAR_GAP) + AXIS_H;

  return (
    <div ref={box} className="relative w-full" onPointerLeave={() => setHover(null)}>
      <Legend tracking={trackingStartIndex !== null} />
      <div className="overflow-x-auto">
        <svg width={svgW} height={mainH} role="img" aria-label="Actions per member and day">
          {ticks.map((t) => (
            <g key={t} pointerEvents="none">
              <line x1={LEFT} x2={LEFT + plotW} y1={lineY(t)} y2={lineY(t)} stroke="#F1F3F7" />
              <text x={LEFT - 6} y={lineY(t) + 3} fontSize={10} textAnchor="end" fill={MUTED}>
                {t}
              </text>
            </g>
          ))}
          <text x={0} y={LINE_TOP - 8} fontSize={10} fill={MUTED} pointerEvents="none">
            Actions in this pool
          </text>
          {marks(LINE_TOP - 6, mainH)}
          {guide(mainH)}
          {drawOrder.map((m) => {
            const points = m.counts
              .map((c, i) => [i, writes(c)] as const)
              .filter(([i]) => i >= m.joinedIndex);
            const path = points
              .map(([i, n], k) => `${k === 0 ? 'M' : 'L'}${cx(i)},${lineY(n)}`)
              .join(' ');
            return (
              <g key={m.name + m.joinedIndex} pointerEvents="none">
                <path
                  d={path}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={m.isAdmin ? 1.5 : 2}
                  strokeLinejoin="round"
                />
                {points.map(([i, n]) => (
                  <circle
                    key={i}
                    cx={cx(i)}
                    cy={lineY(n)}
                    r={hover?.day === i ? 4 : n > 0 ? 3 : 2}
                    fill={m.color}
                  />
                ))}
              </g>
            );
          })}
          <line x1={LEFT} x2={LEFT + plotW} y1={axisY} y2={axisY} stroke={FAINT} />
          {dayLabels(axisY + 15)}
          <text x={0} y={opensTop - 6} fontSize={10} fill={MUTED} pointerEvents="none">
            App opens (any pool)
          </text>
          {members.map((m, row) => {
            const y = opensTop + row * OPENS_ROW_H + OPENS_ROW_H / 2;
            return (
              <g key={m.name + m.joinedIndex} pointerEvents="none">
                <text x={0} y={y + 3.5} fontSize={10} fill={m.color} fontWeight={600}>
                  {m.name.slice(0, 22)}
                </text>
                <line x1={LEFT} x2={LEFT + plotW} y1={y} y2={y} stroke="#F1F3F7" />
                {m.counts.map((c, i) =>
                  i >= m.joinedIndex && c[4] > 0 ? (
                    <circle
                      key={i}
                      cx={cx(i)}
                      cy={y}
                      r={Math.min(2 + Math.log2(c[4]), 5)}
                      fill={m.color}
                    />
                  ) : null,
                )}
              </g>
            );
          })}
          {columns(mainH)}
        </svg>
      </div>

      <p className="text-pool-500 mt-6 mb-2">
        Per member, stacked by kind (same scale for everyone; shaded days are before they joined).
      </p>
      <div className="overflow-x-auto">
        <svg width={svgW} height={multH} role="img" aria-label="Actions per member, by kind">
          {members.map((m, row) => {
            const top = row * (BAR_H + BAR_GAP);
            const base = top + BAR_H;
            return (
              <g key={m.name + m.joinedIndex} pointerEvents="none">
                <text x={0} y={top + BAR_H / 2 + 4} fontSize={11} fill={m.color} fontWeight={600}>
                  {m.name.slice(0, 22)}
                </text>
                {m.joinedIndex > 0 ? (
                  <rect
                    x={LEFT}
                    y={top}
                    width={m.joinedIndex * dayW}
                    height={BAR_H}
                    fill="#F1F3F7"
                  />
                ) : null}
                <line x1={LEFT} x2={LEFT + plotW} y1={base} y2={base} stroke={FAINT} />
                {m.counts.map((c, i) => {
                  if (i < m.joinedIndex) return null;
                  let y = base;
                  return WRITE_KIND_ORDER.map((kind, k) => {
                    const h = (c[k] / yMax) * BAR_H;
                    if (h === 0) return null;
                    y -= h;
                    return (
                      <rect
                        key={`${i}-${kind}`}
                        x={cx(i) - barW / 2}
                        y={y}
                        width={barW}
                        height={h}
                        fill={KIND_COLOR[kind]}
                      />
                    );
                  });
                })}
              </g>
            );
          })}
          {marks(0, multH - AXIS_H)}
          {guide(multH - AXIS_H)}
          {dayLabels(multH - 6)}
          {columns(multH)}
        </svg>
      </div>

      {hover ? <DayTooltip data={data} hover={hover} /> : null}
    </div>
  );
}

function Legend({ tracking }: { tracking: boolean }) {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {[...WRITE_KIND_ORDER, 'opens' as const].map((kind) => (
        <span key={kind} className="flex items-center gap-1">
          <svg width="10" height="10" aria-hidden>
            <rect width="10" height="10" rx="2" fill={KIND_COLOR[kind]} />
          </svg>
          {KIND_LABEL[kind]}
        </span>
      ))}
      <span className="text-pool-500">
        Kind colours are for the bars below. Lines are one per person (yours gray); a dot is that
        day&apos;s total. An open marker&apos;s size grows with the count.
        {tracking ? ' The long-dashed line is where opens start being recorded.' : ''} Short dashes:
        a member&apos;s join.
      </span>
    </p>
  );
}

function longDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Who did what on the hovered day: every member who had joined, in the fixed kind order. */
function DayTooltip({ data, hover }: { data: PoolActivityData; hover: Hover }) {
  const { days, members, trackingStartIndex } = data;
  const day = hover.day;
  const here = members.filter((m) => day >= m.joinedIndex);
  const opensKnown = trackingStartIndex === null ? false : day >= trackingStartIndex;
  // Off the pointer, and to its left near the right edge.
  const left = typeof window !== 'undefined' && hover.x > window.innerWidth - 380;
  const cell = (n: number): ReactNode => (
    <td className={`px-1.5 text-right tabular-nums ${n === 0 ? 'text-pool-500' : ''}`}>{n}</td>
  );
  return (
    <div
      className="border-pool-200 pointer-events-none fixed z-10 rounded border bg-white px-3 py-2 text-xs shadow-md"
      style={{
        top: hover.y + 14,
        left: left ? undefined : hover.x + 14,
        right: left ? window.innerWidth - hover.x + 14 : undefined,
      }}
    >
      <p className="mb-1 font-semibold">{longDay(days[day])}</p>
      {here.length === 0 ? (
        <p className="text-pool-500">Nobody had joined yet.</p>
      ) : (
        <table className="border-collapse">
          <thead>
            <tr className="text-pool-500">
              <th className="pr-3 text-left font-normal">Member</th>
              {[...WRITE_KIND_ORDER, 'opens' as const].map((kind) => (
                <th key={kind} className="px-1.5 text-right font-normal">
                  {KIND_LABEL[kind]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {here.map((m) => {
              const c = m.counts[day];
              const quiet = writes(c) === 0 && c[4] === 0;
              return (
                <tr key={m.name + m.joinedIndex}>
                  <td className="pr-3 whitespace-nowrap">
                    <span className="font-semibold" style={{ color: m.color }}>
                      {m.name}
                    </span>
                    {quiet ? <span className="text-pool-500"> · no activity</span> : null}
                  </td>
                  {cell(c[0])}
                  {cell(c[1])}
                  {cell(c[2])}
                  {cell(c[3])}
                  {opensKnown ? cell(c[4]) : <td className="text-pool-500 px-1.5 text-right">—</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!opensKnown ? (
        <p className="text-pool-500 mt-1">Opens are not recorded for this day.</p>
      ) : null}
    </div>
  );
}
