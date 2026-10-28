import {
  BoardLayout,
  drawnLayout,
  type BoardLayoutJson,
} from '@/features/month-board/board-layout';
import type { DuringClient } from '@/lib/queries/profile';

/** Which view a layout is for (0045): each keeps its own values. */
export type BoardView = 'calendar' | 'lane' | 'members';

/** A row's layout, read through the shape the database holds it to; anything else is no layout. */
function parsed(raw: unknown): BoardLayoutJson | null {
  const result = BoardLayout.safeParse(raw);
  // Videos drawn as photos (part 5).
  return result.success ? drawnLayout(result.data) : null;
}

/**
 * A pool's layouts, by splash (0025): every one its current members set,
 * as RLS lets me read them.
 */
export async function getPoolLayouts(
  supabase: DuringClient,
  poolId: string,
  view: BoardView = 'calendar',
): Promise<Record<string, BoardLayoutJson>> {
  const { data, error } = await supabase
    .from('board_layouts')
    .select('splash_id, layout')
    .eq('scope', 'pool')
    .eq('pool_id', poolId)
    .eq('view', view);
  if (error) throw error;
  return Object.fromEntries(
    (data ?? []).flatMap((row) => {
      const layout = parsed(row.layout);
      return layout ? [[row.splash_id, layout]] : [];
    }),
  );
}

/**
 * Home's layouts (0025): my own Home layouts, by splash, and the pool
 * layouts of the joint splashes on my Home, by splash — the pool's, while
 * I have no Home layout of my own for it.
 */
export async function getHomeLayouts(
  supabase: DuringClient,
  me: string,
  joints: { splashId: string; poolId: string }[],
  view: BoardView = 'calendar',
): Promise<{ home: Record<string, BoardLayoutJson>; pool: Record<string, BoardLayoutJson> }> {
  const [mine, pooled] = await Promise.all([
    supabase
      .from('board_layouts')
      .select('splash_id, layout')
      .eq('scope', 'home')
      .eq('user_id', me)
      .eq('view', view),
    joints.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('board_layouts')
          .select('splash_id, pool_id, layout')
          .eq('scope', 'pool')
          .eq('view', view)
          .in(
            'splash_id',
            joints.map((j) => j.splashId),
          ),
  ]);
  if (mine.error) throw mine.error;
  if (pooled.error) throw pooled.error;
  const poolOf = new Map(joints.map((j) => [j.splashId, j.poolId]));
  const home: Record<string, BoardLayoutJson> = {};
  for (const row of mine.data ?? []) {
    const layout = parsed(row.layout);
    if (layout) home[row.splash_id] = layout;
  }
  const pool: Record<string, BoardLayoutJson> = {};
  for (const row of (pooled.data ?? []) as {
    splash_id: string;
    pool_id: string | null;
    layout: unknown;
  }[]) {
    // Only the joint splash's own pool: the pool it belongs to.
    if (row.pool_id !== poolOf.get(row.splash_id)) continue;
    const layout = parsed(row.layout);
    if (layout) pool[row.splash_id] = layout;
  }
  return { home, pool };
}
