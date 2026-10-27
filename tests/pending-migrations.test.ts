import { describe, expect, it } from 'vitest';

import { pendingMigrations } from '../scripts/pending-migrations.mjs';

/** Production's answer to applied_migrations, as PostgREST gives it. */
const answering = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const FILES = [
  '0044_board_layout_wider.sql',
  '0045_board_layout_views.sql',
  '0046_applied_migrations.sql',
];
const env = { url: 'https://example.supabase.co', key: 'service' };

describe('a production build waits for its migrations (0046)', () => {
  it('names every file production has not applied', async () => {
    expect(
      await pendingMigrations(FILES, { ...env, fetchImpl: answering(200, ['0044', '0045']) }),
    ).toEqual(['0046_applied_migrations.sql']);
    expect(
      await pendingMigrations(FILES, {
        ...env,
        fetchImpl: answering(200, ['0044', '0045', '0046']),
      }),
    ).toEqual([]);
  });

  it('never guesses: a refusal, a non-list or no key is an error', async () => {
    await expect(
      pendingMigrations(FILES, { ...env, fetchImpl: answering(404, {}) }),
    ).rejects.toThrow('production answered 404');
    await expect(
      pendingMigrations(FILES, { ...env, fetchImpl: answering(200, { version: '0046' }) }),
    ).rejects.toThrow('other than a list');
    await expect(pendingMigrations(FILES, { url: env.url, key: '' })).rejects.toThrow(
      'service key',
    );
  });
});
