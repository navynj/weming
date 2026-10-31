import type { EventRow, OpenRow, PersonRow } from '@/lib/admin/queries';
import { dayIn, daysBetween, type Zone } from '@/lib/admin/zones';

/** The five things a dot can be, each its own row inside a person's band. */
const KINDS = [
  { kind: 'splash', label: 'Splash', color: '#0072B2' },
  { kind: 'ripple', label: 'Ripple', color: '#56B4E9' },
  { kind: 'reply', label: 'Reply', color: '#009E73' },
  { kind: 'reaction', label: 'Reaction', color: '#E69F00' },
  { kind: 'open', label: 'App open (any pool)', color: '#CC79A7' },
] as const;

const LABEL_W = 150;
const DAY_W = 14;
const LINE_H = 9;
const BAND_GAP = 10;
const BAND_H = KINDS.length * LINE_H + BAND_GAP;
const TOP = 22;

/** Days shown at most: the newest ones. */
const MAX_DAYS = 90;

/**
 * A pool's activity (H71): one band per person, days across, a dot where
 * they did something that day. A dot's size says how many, roughly; its
 * title says exactly. Dots only: nothing anyone wrote.
 */
export function ActivityTimeline({
  people,
  events,
  opens,
  poolCreated,
  now,
  zone,
}: {
  people: PersonRow[];
  events: EventRow[];
  opens: OpenRow[];
  poolCreated: string;
  now: number;
  zone: Zone;
}) {
  const today = dayIn(now, zone);
  const all = daysBetween(dayIn(Date.parse(poolCreated), zone), today);
  const days = all.slice(-MAX_DAYS);
  const column = new Map(days.map((d, i) => [d, i]));

  // person → kind → day → count
  const counts = new Map<string, Map<string, Map<string, number>>>();
  const add = (user: string, kind: string, at: string): void => {
    const day = dayIn(Date.parse(at), zone);
    if (!column.has(day)) return;
    const byKind = counts.get(user) ?? new Map<string, Map<string, number>>();
    const byDay = byKind.get(kind) ?? new Map<string, number>();
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
    byKind.set(kind, byDay);
    counts.set(user, byKind);
  };
  for (const e of events) add(e.user_id, e.kind, e.at);
  for (const o of opens) add(o.user_id, 'open', o.started_at);

  // Room past the last day for a week's label that starts there.
  const width = LABEL_W + days.length * DAY_W + 36;
  const height = TOP + people.length * BAND_H;

  return (
    <div>
      <p className="mb-2 flex flex-wrap gap-4">
        {KINDS.map((k) => (
          <span key={k.kind} className="flex items-center gap-1">
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="4" fill={k.color} />
            </svg>
            {k.label}
          </span>
        ))}
      </p>
      {all.length > MAX_DAYS ? (
        <p className="text-pool-500 mb-2">The last {MAX_DAYS} days.</p>
      ) : null}
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Activity by member and day">
          {days.map((d, i) =>
            i % 7 === 0 ? (
              <g key={d}>
                <line
                  x1={LABEL_W + i * DAY_W}
                  x2={LABEL_W + i * DAY_W}
                  y1={TOP - 4}
                  y2={height}
                  stroke="#D8DCE8"
                />
                <text x={LABEL_W + i * DAY_W + 2} y={12} fontSize={10} fill="#6B79A3">
                  {d.slice(5)}
                </text>
              </g>
            ) : null,
          )}
          {people.map((p, row) => {
            const y0 = TOP + row * BAND_H;
            const mine = counts.get(p.user_id);
            return (
              <g key={p.user_id}>
                <text x={0} y={y0 + (KINDS.length * LINE_H) / 2 + 4} fontSize={11} fill="#161621">
                  {p.display_name.slice(0, 22)}
                </text>
                <line
                  x1={LABEL_W}
                  x2={width}
                  y1={y0 + BAND_H - BAND_GAP / 2}
                  y2={y0 + BAND_H - BAND_GAP / 2}
                  stroke="#F1F3F7"
                />
                {KINDS.map((k, line) =>
                  [...(mine?.get(k.kind) ?? new Map<string, number>())].map(([day, n]) => (
                    <circle
                      key={`${k.kind}-${day}`}
                      cx={LABEL_W + column.get(day)! * DAY_W + DAY_W / 2}
                      cy={y0 + line * LINE_H + LINE_H / 2}
                      r={Math.min(2.5 + Math.log2(n), 5.5)}
                      fill={k.color}
                    >
                      <title>{`${p.display_name} · ${day} · ${n} ${k.label.toLowerCase()}`}</title>
                    </circle>
                  )),
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
