import { describe, expect, it } from 'vitest';

import {
  anonymous,
  asUser,
  JAE,
  JAE_RIPPLE,
  LOCKED_RIPPLE,
  MINA,
  UNLOCKED_RIPPLE,
  YOONJI,
} from './as-user';

/**
 * The leak model is enforced in RLS, not in application code (CLAUDE.md), so
 * these tests query PostgREST as real users and assert on what comes back.
 * Anything provable here is provable for every future feature; anything the
 * client can reach here, it can reach from the browser.
 */

describe('signed out', () => {
  it('reaches nothing at all', async () => {
    const anon = anonymous();

    for (const table of ['ripples', 'profiles', 'links', 'my_categories'] as const) {
      const { data } = await anon.from(table).select('*');
      expect(data, table).toEqual([]);
    }
  });
});

/**
 * Link retired (0023): pools are the one way to share, so a link between two
 * people grants nothing. Jae is still linked to Yoonji in the seed and shares
 * no pool with anyone: he stands for a former linked friend.
 */
describe('a former linked friend (0023)', () => {
  it('reads none of my ripples outside a shared pool, locked or not', async () => {
    const { data, error } = await asUser(JAE).from('ripples').select('id').eq('author_id', YOONJI);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    for (const id of [UNLOCKED_RIPPLE, LOCKED_RIPPLE]) {
      expect((await asUser(JAE).from('ripples').select('id').eq('id', id)).data).toEqual([]);
    }
  });

  it('reads none of my splashes, nor my profile', async () => {
    expect((await asUser(JAE).from('splashes').select('id').eq('owner_id', YOONJI)).data).toEqual(
      [],
    );
    expect((await asUser(JAE).from('profiles').select('id').eq('id', YOONJI)).data).toEqual([]);
  });

  it('cannot make a new link', async () => {
    const { error } = await asUser(JAE).from('links').insert({ user_a: JAE, user_b: MINA });
    expect(error).not.toBeNull();
  });

  it('still reads the link rows they are part of (kept, granting nothing)', async () => {
    const { data } = await asUser(JAE).from('links').select('user_a, user_b');
    expect(data).toHaveLength(1);
  });

  it('keeps a locked ripple visible to its author', async () => {
    const { data } = await asUser(YOONJI).from('ripples').select('id').eq('id', LOCKED_RIPPLE);
    expect(data).toHaveLength(1);
  });

  it('shows nothing between people with neither a link nor a pool', async () => {
    const { data } = await asUser(MINA).from('ripples').select('id').eq('id', JAE_RIPPLE);
    expect(data).toEqual([]);
  });
});

describe('lock state', () => {
  it('does not expose audience rows to anyone but their author', async () => {
    // Reading the absence of a lock row would be enough to infer the presence
    // of one elsewhere, so routing is private in both directions.
    const { data } = await asUser(JAE).from('ripple_audience').select('*');

    expect(data).toEqual([]);
  });

  it('exposes audience rows to the author', async () => {
    const { data } = await asUser(YOONJI)
      .from('ripple_audience')
      .select('*')
      .eq('ripple_id', LOCKED_RIPPLE);

    expect(data).toHaveLength(1);
  });
});

describe('the witness signal', () => {
  it('lets the author read the view count', async () => {
    const { data, error } = await asUser(YOONJI)
      .from('ripple_views')
      .select('*')
      .eq('ripple_id', UNLOCKED_RIPPLE);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('never shows a viewer who else has looked', async () => {
    // A6: the signal is a count, and only the author has it. Not even one's
    // own view row is readable back.
    const { data } = await asUser(MINA).from('ripple_views').select('*');

    expect(data).toEqual([]);
  });

  // Recording a view of a ripple seen through a pool: pools-rls.test.ts.
  it('refuses a view from someone who cannot see the ripple (a former link)', async () => {
    const { error } = await asUser(JAE).rpc('record_ripple_view', { rid: UNLOCKED_RIPPLE });

    expect(error).not.toBeNull();
  });

  it('refuses a view of a locked ripple', async () => {
    const { error } = await asUser(MINA).rpc('record_ripple_view', { rid: LOCKED_RIPPLE });

    expect(error).not.toBeNull();
  });

  it('does not let an author witness themselves', async () => {
    // A no-op, not an error: opening one's own Ripple is routine.
    const { error } = await asUser(YOONJI).rpc('record_ripple_view', { rid: UNLOCKED_RIPPLE });
    expect(error).toBeNull();

    const { data } = await asUser(YOONJI)
      .from('ripple_views')
      .select('viewer_id')
      .eq('ripple_id', UNLOCKED_RIPPLE);

    expect((data ?? []).map((view) => view.viewer_id)).toEqual([MINA]);
  });

  it('refuses a direct write to the view table', async () => {
    const { error } = await asUser(MINA)
      .from('ripple_views')
      .insert({ ripple_id: UNLOCKED_RIPPLE, viewer_id: MINA });

    expect(error).not.toBeNull();
  });
});

describe('profiles', () => {
  it('is readable by its owner', async () => {
    const { data } = await asUser(YOONJI).from('profiles').select('display_name').eq('id', YOONJI);

    expect(data).toEqual([{ display_name: 'Yoonji' }]);
  });

  it('is not readable by a former link (0023)', async () => {
    const { data } = await asUser(JAE).from('profiles').select('display_name').eq('id', YOONJI);

    expect(data).toEqual([]);
  });

  it('is not readable by a stranger', async () => {
    const { data } = await asUser(MINA).from('profiles').select('display_name').eq('id', JAE);

    expect(data).toEqual([]);
  });
});

describe('write paths', () => {
  it('refuses a ripple authored as someone else', async () => {
    const { error } = await asUser(MINA).from('ripples').insert({
      author_id: YOONJI,
      occurred_on: '2026-01-01',
    });

    expect(error).not.toBeNull();
  });

  it("refuses to delete another author's ripple", async () => {
    await asUser(MINA).from('ripples').delete().eq('id', UNLOCKED_RIPPLE);

    // Delete of an invisible row is a silent no-op, so assert on the row.
    const { data } = await asUser(YOONJI).from('ripples').select('id').eq('id', UNLOCKED_RIPPLE);
    expect(data).toHaveLength(1);
  });

  it('refuses to link two other people together', async () => {
    const { error } = await asUser(MINA).from('links').insert({ user_a: JAE, user_b: YOONJI });

    expect(error).not.toBeNull();
  });
});
