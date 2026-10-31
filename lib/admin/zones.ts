/**
 * The dashboard's clock (H71): testers live in Vancouver and Seoul, so every
 * time and every day boundary is read in a zone picked on the page.
 */
export const ZONES = [
  { id: 'America/Vancouver', label: 'Vancouver' },
  { id: 'Asia/Seoul', label: 'Seoul' },
] as const;

export type Zone = (typeof ZONES)[number]['id'];

export function zoneOf(param: string | string[] | undefined): Zone {
  return ZONES.find((z) => z.id === param)?.id ?? 'America/Vancouver';
}

/** The day a moment falls on in a zone, as YYYY-MM-DD. */
export function dayIn(at: number, zone: Zone): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The calendar day after a YYYY-MM-DD day. */
export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Every day from the first to the last, both included. */
export function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let d = first; d <= last; d = nextDay(d)) days.push(d);
  return days;
}

export function formatAt(at: number | string | null, zone: Zone): string {
  if (at === null) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(typeof at === 'string' ? Date.parse(at) : at);
}

export function formatDuration(span: number | null): string {
  if (span === null) return '—';
  const minutes = Math.round(span / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatRatio(r: { yes: number; of: number }): string {
  return r.of === 0 ? '—' : `${r.yes}/${r.of} (${Math.round((r.yes / r.of) * 100)}%)`;
}
