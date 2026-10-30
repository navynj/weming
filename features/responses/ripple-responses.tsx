'use client';

import { useState } from 'react';

import { usePeople } from '@/features/people/people-provider';

import { chipsOf, repliesShown, type RippleResponsesValue } from './model';
import { ReactionChips } from './reaction-chips';
import { ReplyList, type ReplyHandlers } from './reply-list';

/**
 * What readers left under one block (H25): its reaction chips, then its
 * replies. The reply field is not always open: "Reply" at the left end of
 * the reactions row, its chips at the right end, opens it, with Cancel and Save (Yoonji, in the
 * session). Nothing at all where nobody else can see the ripple and nothing
 * was left; a locked ripple takes none (0030).
 */
export function RippleResponses({
  rippleId,
  rippleAuthor,
  value,
  canRespond,
  expanded,
  onExpand,
  onReact,
  on,
}: {
  rippleId: string;
  rippleAuthor: string;
  value: RippleResponsesValue;
  canRespond: boolean;
  expanded: boolean;
  onExpand: () => void;
  onReact: (emoji: string) => void;
  on: ReplyHandlers;
}) {
  const { me } = usePeople();
  const [composing, setComposing] = useState(false);
  const chips = chipsOf(value.reactions, rippleId, me ?? '');
  const { shown, more } = repliesShown(value.replies, rippleId, expanded);
  if (!canRespond && chips.length === 0 && shown.length === 0) return null;
  return (
    <div data-ripple-responses={rippleId} className="flex flex-col gap-2 pt-2">
      <ReactionChips
        chips={chips}
        canReact={canRespond}
        onToggle={onReact}
        leading={
          canRespond ? (
            <button
              type="button"
              data-reply-toggle
              aria-expanded={composing}
              onClick={() => setComposing((open) => !open)}
              className="text-pool-500 text-xs font-medium"
            >
              Reply
            </button>
          ) : null
        }
      />
      <ReplyList
        replies={shown}
        more={more}
        rippleAuthor={rippleAuthor}
        canReply={canRespond}
        onMore={onExpand}
        on={on}
        composing={composing}
        onDoneComposing={() => setComposing(false)}
      />
    </div>
  );
}
