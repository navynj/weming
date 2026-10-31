import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatAt, ZONES, type Zone } from '@/lib/admin/zones';

const PAGES = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/pools', label: 'Pools' },
  { href: '/admin/notifications', label: 'Notifications' },
] as const;

/**
 * The dashboard's frame (H71): its own pages, the zone, and where tracked
 * data starts. Plain on purpose; it is a tool, not a surface of the app.
 */
export function AdminFrame({
  path,
  zone,
  trackingStart,
  query = {},
  children,
}: {
  path: string;
  zone: Zone;
  trackingStart: string | null;
  query?: Record<string, string>;
  children: ReactNode;
}) {
  const withZone = (href: string, z: Zone = zone): string =>
    `${href}?${new URLSearchParams({ ...(href === path ? query : {}), tz: z })}`;
  return (
    <div className="text-ink min-h-dvh bg-white px-6 py-6 text-sm">
      <header className="border-pool-200 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-3">
        <span className="font-semibold">Weming admin</span>
        <nav className="flex gap-4">
          {PAGES.map((p) => (
            <Link
              key={p.href}
              href={withZone(p.href)}
              className={p.href === path ? 'font-semibold underline' : 'text-pool-500'}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto flex gap-3">
          Times in
          {ZONES.map((z) => (
            <Link
              key={z.id}
              href={withZone(path, z.id)}
              className={z.id === zone ? 'font-semibold underline' : 'text-pool-500'}
            >
              {z.label}
            </Link>
          ))}
        </span>
      </header>
      <p className="bg-pool-100 text-pool-500 mb-6 rounded px-3 py-2">
        Splashes, ripples, replies, reactions and joins are read from their own timestamps, back to
        each pool&apos;s start. App opens, notification sends and taps, and invite link opens are
        recorded only from {formatAt(trackingStart, zone)}; before that they show as zero or —.
        Metadata only: no titles, words or photos are read here.
      </p>
      {children}
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-pool-200 border-b px-2 py-1 font-semibold whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="odd:bg-pool-100">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="text-pool-500 px-2 py-3">Nothing yet.</p> : null}
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-base font-semibold">{title}</h2>
      {note ? <p className="text-pool-500 mb-2">{note}</p> : null}
      {children}
    </section>
  );
}
