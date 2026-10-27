'use client';

import { usePeople } from '@/features/people/people-provider';

import { chipsOf, repliesShown, type RippleResponsesValue } from './model';
import { ReactionChips } from './reaction-chips';
import { ReplyList, type ReplyHandlers } from './reply-list';

/**
 * What readers left under one block (H24): its reaction chips, then its
 * replies and the reply input. Nothing at all where nobody else can see the
 * ripple and nothing was left; a locked ripple takes none (0030).
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
  const chips = chipsOf(value.reactions, rippleId, me ?? '');
  const { shown, more } = repliesShown(value.replies, rippleId, expanded);
  if (!canRespond && chips.length === 0 && shown.length === 0) return null;
  return (
    <div data-ripple-responses={rippleId} className="flex flex-col gap-2 pt-2">
      <ReactionChips chips={chips} canReact={canRespond} onToggle={onReact} />
      <ReplyList
        replies={shown}
        more={more}
        rippleAuthor={rippleAuthor}
        canReply={canRespond}
        onMore={onExpand}
        on={on}
      />
    </div>
  );
}
