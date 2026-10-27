/**
 * The choice when composing from a pool (H23, 0033): a pool lane, and with
 * whom. With nobody picked in Together, my pool record — mine, in this pool,
 * no lane of mine; with members picked, a joint record whose "Add your side"
 * slots are theirs.
 */
export type PoolPick =
  | { kind: 'joint'; poolLaneId: string }
  /** My pool record (once Just mine, 0014): mine, on that pool lane. */
  | { kind: 'own'; poolLaneId: string }
  | null;

/** Where a pick lands, by Together: nobody is my pool record; Everyone or anyone, joint. */
export function resolvePick(
  poolLaneId: string,
  together: string[],
  everyone = false,
): Exclude<PoolPick, null> {
  return everyone || together.length > 0
    ? { kind: 'joint', poolLaneId }
    : { kind: 'own', poolLaneId };
}

/**
 * Together's state (0033): Everyone — dynamic, every current member, later
 * joiners too — and the faces picked one by one. Everyone shows every face
 * picked; deselecting any face turns it off and keeps the rest picked;
 * picking every face by hand does not turn it on.
 */
export type Together = { everyone: boolean; picked: string[] };

export function toggleFace(state: Together, id: string, others: string[]): Together {
  const shown = state.everyone ? others : state.picked;
  return shown.includes(id)
    ? { everyone: false, picked: shown.filter((x) => x !== id) }
    : { everyone: false, picked: [...shown, id] };
}

export function toggleEveryone(state: Together, others: string[]): Together {
  return state.everyone ? { everyone: false, picked: [] } : { everyone: true, picked: others };
}

/**
 * "Yours · in Our Pool", "Together with everyone", or "Together with Mina,
 * Jae". No "lane" on a compose screen (hotfix 2026-10-26).
 */
export function landingHint(poolName: string, togetherNames: string[], everyone = false): string {
  if (everyone) return 'Together with everyone';
  return togetherNames.length > 0
    ? `Together with ${togetherNames.join(', ')}`
    : `Yours · in ${poolName}`;
}
