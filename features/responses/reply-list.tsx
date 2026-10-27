'use client';

import { useState } from 'react';

import { Avatar, PersonName } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';

import { relativeTime, type ReplyRow } from './model';
import { ReplyInput } from './reply-input';

/** A reply's face: small, beside its words. */
const FACE_PX = 16;

export type ReplyHandlers = {
  reply: (body: string) => void;
  edit: (id: string, body: string) => void;
  remove: (id: string) => void;
  hide: (id: string, hidden: boolean) => void;
};

/**
 * A block's replies (H25): the first two, oldest first, then "+n more
 * replies"; each its author's face, name, age and text — "edited" once
 * edited, "Hidden by the author" once hidden. Mine I edit and delete; on my
 * ripple I hide anyone's. The one-line input opens from the reactions
 * row's "Reply" (Yoonji, in the session), at the bottom, with Cancel and
 * Save, and grows to four lines.
 */
export function ReplyList({
  replies,
  more,
  rippleAuthor,
  canReply,
  onMore,
  on,
  composing = false,
  onDoneComposing = () => {},
}: {
  replies: ReplyRow[];
  more: number;
  rippleAuthor: string;
  canReply: boolean;
  onMore: () => void;
  on: ReplyHandlers;
  /** The reply field is open, asked for by the reactions row's "Reply". */
  composing?: boolean;
  onDoneComposing?: () => void;
}) {
  const { me } = usePeople();
  const [editing, setEditing] = useState<string | null>(null);
  if (replies.length === 0 && !(canReply && composing)) return null;
  return (
    <div data-replies className="flex flex-col gap-2">
      {replies.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {replies.map((reply) => (
            <li
              key={reply.id}
              id={`reply-${reply.id}`}
              data-reply={reply.id}
              data-hidden={reply.hidden ? '' : undefined}
              className="grid gap-x-2"
              style={{ gridTemplateColumns: `${FACE_PX}px minmax(0, 1fr)` }}
            >
              <Avatar
                id={reply.author_id}
                initials=""
                className="bg-pool-100 text-pool-500 mt-0.5 flex items-center justify-center rounded-full text-[10px]"
                style={{ width: FACE_PX, height: FACE_PX }}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-pool-500 flex flex-wrap items-baseline gap-x-1 text-[11px]">
                  <span className="text-ink font-medium">
                    <PersonName id={reply.author_id} name="Someone" />
                  </span>
                  <span>· {relativeTime(reply.created_at)}</span>
                  {reply.edited_at ? <span data-reply-edited>· edited</span> : null}
                  {reply.former ? <span data-reply-former>· Former member</span> : null}
                </p>
                {editing === reply.id ? (
                  <ReplyInput
                    initial={reply.body ?? ''}
                    label="Edit reply"
                    onSubmit={(body) => {
                      setEditing(null);
                      on.edit(reply.id, body);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                ) : reply.body === null ? (
                  <p className="text-pool-500 text-sm italic">Hidden by the author</p>
                ) : (
                  <p className="text-ink text-sm break-words whitespace-pre-wrap">{reply.body}</p>
                )}
                {reply.hidden && reply.body !== null ? (
                  <p className="text-pool-500 text-[11px] italic">Hidden by the author</p>
                ) : null}
                <ReplyActions
                  reply={reply}
                  mine={reply.author_id === me}
                  onMyRipple={rippleAuthor === me && reply.author_id !== me}
                  editing={editing === reply.id}
                  onEdit={() => setEditing(reply.id)}
                  on={on}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {more > 0 ? (
        <button
          type="button"
          data-replies-more
          onClick={onMore}
          className="text-main-900 self-start text-xs font-medium"
        >
          +{more} more {more === 1 ? 'reply' : 'replies'}
        </button>
      ) : null}
      {canReply && composing ? (
        <ReplyInput
          label="Reply"
          autoFocus
          onSubmit={(body) => {
            on.reply(body);
            onDoneComposing();
          }}
          onCancel={onDoneComposing}
        />
      ) : null}
    </div>
  );
}

function ReplyActions({
  reply,
  mine,
  onMyRipple,
  editing,
  onEdit,
  on,
}: {
  reply: ReplyRow;
  mine: boolean;
  onMyRipple: boolean;
  editing: boolean;
  onEdit: () => void;
  on: ReplyHandlers;
}) {
  if (editing || (!mine && !onMyRipple)) return null;
  const action = 'text-pool-500 text-[11px] font-medium';
  return (
    <span className="flex gap-3">
      {mine && !reply.hidden ? (
        <button type="button" data-reply-edit onClick={onEdit} className={action}>
          Edit
        </button>
      ) : null}
      {mine ? (
        <button
          type="button"
          data-reply-delete
          onClick={() => on.remove(reply.id)}
          className={action}
        >
          Delete
        </button>
      ) : null}
      {onMyRipple ? (
        <button
          type="button"
          data-reply-hide
          onClick={() => on.hide(reply.id, !reply.hidden)}
          className={action}
        >
          {reply.hidden ? 'Show' : 'Hide'}
        </button>
      ) : null}
    </span>
  );
}
