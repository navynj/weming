import type { Database } from '@/lib/database.types';

import type { AdminDb } from './access';

/**
 * Everything the dashboard reads (H71), each through an admin_* function
 * (0071). No table is named here, and none of these rows has a content
 * column to carry: ids, kinds, times, counts, a pool's name, a member's
 * display name, a photo as a boolean.
 */
type Fn = Database['public']['Functions'];
/** Generated types read every returned column as present; these may be null. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };
export type PoolRow = Nullable<Fn['admin_pools']['Returns'][number], 'owner_id'>;
export type PersonRow = Nullable<
  Fn['admin_pool_people']['Returns'][number],
  'joined_at' | 'left_at' | 'invited_at'
>;
export type EventRow = Fn['admin_pool_events']['Returns'][number];
export type OpenRow = Nullable<Fn['admin_app_opens']['Returns'][number], 'notification_pool_id'>;
export type NotificationRow = Nullable<
  Fn['admin_notifications']['Returns'][number],
  'clicked_at' | 'influenced_open_at'
>;
export type LinkVisitRow = Fn['admin_invite_link_visits']['Returns'][number];

/** PostgREST answers at most this many rows at once (config.toml max_rows). */
const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function everyRow<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function trackingStart(db: AdminDb): Promise<string | null> {
  const { data, error } = await db.rpc('admin_tracking_start');
  if (error) throw new Error(error.message);
  return data;
}

export function pools(db: AdminDb): Promise<PoolRow[]> {
  return everyRow((from, to) => db.rpc('admin_pools').order('pool_id').range(from, to));
}

export function people(db: AdminDb, pool: string | null = null): Promise<PersonRow[]> {
  return everyRow((from, to) =>
    db
      .rpc('admin_pool_people', pool ? { p_pool: pool } : {})
      .order('pool_id')
      .order('user_id')
      .range(from, to),
  );
}

export function events(db: AdminDb, pool: string | null = null): Promise<EventRow[]> {
  // Every column in the order, so no row falls between two pages.
  return everyRow((from, to) =>
    db
      .rpc('admin_pool_events', pool ? { p_pool: pool } : {})
      .order('at')
      .order('pool_id')
      .order('user_id')
      .order('kind')
      .order('splash_id')
      .range(from, to),
  );
}

export function opens(db: AdminDb, users: string[] | null = null): Promise<OpenRow[]> {
  return everyRow((from, to) =>
    db
      .rpc('admin_app_opens', users ? { p_users: users } : {})
      .order('id')
      .range(from, to),
  );
}

export function notifications(db: AdminDb): Promise<NotificationRow[]> {
  return everyRow((from, to) =>
    db.rpc('admin_notifications').order('notification_id').range(from, to),
  );
}

export function linkVisits(db: AdminDb): Promise<LinkVisitRow[]> {
  return everyRow((from, to) =>
    db.rpc('admin_invite_link_visits').order('opened_at').order('pool_id').range(from, to),
  );
}

/** The moment a page's rows were read: every "now" on the page is this one. */
export async function readAt(): Promise<number> {
  return Date.now();
}
