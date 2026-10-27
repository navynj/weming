'use client';

import { useSyncExternalStore } from 'react';

import { usePeople } from '@/features/people/people-provider';
import { useOptimisticAction, type ActionOutcome } from '@/lib/use-optimistic-action';

import { addReply, deleteReply, editReply, hideReply, setReaction } from './actions';
import { useShowOnBoard } from './board-pending';
import { boardFrom, toggled, type ReplyRow, type RippleResponsesValue } from './model';
import type { ReplyHandlers } from './reply-list';

/**
 * A splash page's reactions and replies (H24), every change optimistic
 * (CLAUDE.md, the principle): shown on the page and on the board beneath it
 * the moment it is made, the action behind it, a refusal taking both back.
 */
export function useRippleResponses(
  splashId: string,
  initial: RippleResponsesValue,
): {
  value: RippleResponsesValue;
  react: (rippleId: string, emoji: string) => void;
  handlers: (rippleId: string) => ReplyHandlers;
  message: string | null;
} {
  const { me } = usePeople();
  const show = useShowOnBoard();
  const { value, run, message } = useOptimisticAction(initial);

  function change(
    update: (current: RippleResponsesValue) => RippleResponsesValue,
    work: () => Promise<ActionOutcome>,
  ): void {
    const before = value;
    show(splashId, boardFrom(update(before)));
    run(update, async () => {
      const outcome = await work();
      if (!outcome.ok) show(splashId, boardFrom(before));
      return outcome;
    });
  }

  const replies = (
    current: RippleResponsesValue,
    map: (rows: ReplyRow[]) => ReplyRow[],
  ): RippleResponsesValue => ({ ...current, replies: map(current.replies) });

  function react(rippleId: string, emoji: string): void {
    if (!me) return;
    const { on } = toggled(value.reactions, rippleId, me, emoji);
    change(
      (current) => ({
        ...current,
        reactions: toggled(current.reactions, rippleId, me, emoji).rows,
      }),
      () => setReaction({ rippleId, emoji, on }),
    );
  }

  function handlers(rippleId: string): ReplyHandlers {
    return {
      reply: (body) => {
        if (!me) return;
        // Minted here, so the reply on screen is the row that lands.
        const id = crypto.randomUUID();
        const row: ReplyRow = {
          id,
          ripple_id: rippleId,
          author_id: me,
          body,
          created_at: new Date().toISOString(),
          edited_at: null,
          hidden: false,
          former: false,
        };
        change(
          (current) => replies(current, (rows) => [...rows, row]),
          () => addReply({ id, rippleId, body }),
        );
      },
      edit: (id, body) =>
        change(
          (current) =>
            replies(current, (rows) =>
              rows.map((r) =>
                r.id === id ? { ...r, body, edited_at: new Date().toISOString() } : r,
              ),
            ),
          () => editReply({ id, body }),
        ),
      remove: (id) =>
        change(
          (current) => replies(current, (rows) => rows.filter((r) => r.id !== id)),
          () => deleteReply(id),
        ),
      hide: (id, hidden) =>
        change(
          (current) =>
            replies(current, (rows) => rows.map((r) => (r.id === id ? { ...r, hidden } : r))),
          () => hideReply(id, hidden),
        ),
    };
  }

  return { value, react, handlers, message };
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The reply or block the page was opened at (`#reply-<id>`, `#block-<id>`),
 * from a tap on the board (H24); empty on the server.
 */
export function useOpenedAt(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => '',
  );
}
