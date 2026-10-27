'use client';

import type { CSSProperties } from 'react';

import type { Card } from '@/features/home/grid';
import { Avatar } from '@/features/people/avatar';
import { REPLIES_SHOWN } from '@/features/responses/model';

import { REPLY_INDENT_PX, type BoardMetrics, type BoardPiece, type Box } from './layout';

/** Where, within the label's own frame, a box of the piece sits. */
function within(box: Box, label: Box): CSSProperties {
  return { left: box.x - label.x, top: box.y - label.y, width: box.w, height: box.h };
}

/**
 * A splash's reactions and first replies on the board (H25), drawn in the
 * label's own frame — the same box and the same transform — so they follow
 * its offset and tilt. The badge: a white pill on its top-right corner (or
 * top-left, after a sticker set there by hand), up to three emoji and the
 * count, one emoji on a phone. The reply lines: a face and one line of
 * words each, under the label, a thin thread from the label to the last,
 * then "+n". White at 85% and 70% means "secondary", never time: the reply
 * fade is not the ripples' opacity channel (H25, SPEC 7 law 1). Each opens
 * the splash at what it shows.
 */
export function BoardResponsesView({
  piece,
  metrics,
  moved,
  fade,
  onOpenAt,
}: {
  piece: BoardPiece;
  metrics: BoardMetrics;
  /** The label's offset and tilt set by hand, as its transform. */
  moved: string | undefined;
  fade: string;
  onOpenAt: (card: Card, anchor: string) => void;
}) {
  const { card } = piece;
  const responses = card.responses;
  if (!responses || (!piece.badgeBox && piece.replyLines.length === 0)) return null;
  const label = piece.labelBox;
  const { reply, badge } = metrics;
  const last = piece.replyLines.at(-1);
  const emoji = responses.emoji.slice(0, badge.emoji);
  return (
    <div
      data-board-responses={piece.id}
      // Over the label, at the stickers' layer (review: z 2), never a layer of its own above them.
      className={`pointer-events-none absolute z-[2] ${fade}`}
      style={{ left: label.x, top: label.y, width: label.w, height: label.h, transform: moved }}
    >
      {piece.badgeBox ? (
        <button
          type="button"
          data-board-badge={piece.id}
          data-badge-at={piece.badgeAt ?? undefined}
          aria-label={`${responses.reactions} reaction${responses.reactions === 1 ? '' : 's'}`}
          onClick={() => onOpenAt(card, 'responded')}
          className="text-main-900 border-main-900/20 pointer-events-auto absolute flex items-center justify-center gap-[3px] rounded-full border bg-white px-[5px] leading-none font-medium tabular-nums"
          style={{ ...within(piece.badgeBox, label), fontSize: badge.size }}
        >
          <span aria-hidden className="flex items-center">
            {emoji.map((e, at) => (
              <span key={e} style={{ marginLeft: at === 0 ? 0 : -3 }}>
                {e}
              </span>
            ))}
          </span>
          <span>{responses.reactions}</span>
        </button>
      ) : null}
      {last ? (
        // The thread: from the label down to the last reply line's middle.
        <span
          aria-hidden
          data-board-reply-thread
          className="absolute w-px bg-white/30"
          style={{
            left: REPLY_INDENT_PX + reply.face / 2,
            top: label.h,
            height: last.y - label.y - label.h + last.h / 2,
          }}
        />
      ) : null}
      {piece.replyLines.map((box, at) => {
        const shown = at < REPLIES_SHOWN ? responses.replies[at] : undefined;
        if (!shown) {
          // The last line: how many more, opening at the first of them.
          const third = responses.replies[REPLIES_SHOWN];
          return (
            <button
              key="more"
              type="button"
              data-board-reply-more
              onClick={() => onOpenAt(card, third ? `reply-${third.id}` : 'responded')}
              className="pointer-events-auto absolute flex items-center text-left font-medium text-white/70"
              style={{
                ...within(box, label),
                fontSize: reply.size,
                lineHeight: `${box.h}px`,
                paddingLeft: reply.face + 4,
              }}
            >
              +{piece.replyMore}
            </button>
          );
        }
        return (
          <button
            key={shown.id}
            type="button"
            data-board-reply={shown.id}
            onClick={() => onOpenAt(card, `reply-${shown.id}`)}
            className="pointer-events-auto absolute flex items-center gap-1 text-left text-white/85"
            style={{ ...within(box, label), fontSize: reply.size, lineHeight: `${box.h}px` }}
          >
            <Avatar
              id={shown.authorId}
              initials=""
              className="text-main-900 flex shrink-0 items-center justify-center rounded-full bg-white text-[10px] leading-none ring-1 ring-white/30"
              style={{ width: reply.face, height: reply.face }}
            />
            <span className="min-w-0 truncate">{shown.body}</span>
          </button>
        );
      })}
    </div>
  );
}
