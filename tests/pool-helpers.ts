import { asAdmin, asUser } from './as-user';

/**
 * Everyone but the owner leaves, keeping their records there, so the owner
 * may delete the pool as its one current member (0064). Keeping is the
 * leave that changes least: the teardown still returns their words.
 */
export async function othersLeave(pool: string, owner: string): Promise<void> {
  const { data, error } = await asAdmin()
    .from('pool_members')
    .select('user_id')
    .eq('pool_id', pool)
    .is('left_at', null)
    .neq('user_id', owner);
  if (error) throw error;
  for (const { user_id } of data ?? []) {
    const left = await asUser(user_id).rpc('leave_pool', { p_pool: pool, p_keep: true });
    if (left.error) throw left.error;
  }
}

/** The owner hands the pool to `to` (0063), so the owner may leave as a member. */
export async function handOn(pool: string, owner: string, to: string): Promise<void> {
  const done = await asUser(owner).rpc('transfer_pool_owner', { p_pool: pool, p_to: to });
  if (done.error) throw done.error;
}
