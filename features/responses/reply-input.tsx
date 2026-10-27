'use client';

import { useState, type KeyboardEvent } from 'react';

import { REPLY_MAX } from './model';

/** The count of what is left shows this close to the limit. */
const NEAR_LIMIT = 50;

/** One line that grows to four (H24): Enter sends, Shift+Enter breaks the line. */
export function ReplyInput({
  initial = '',
  label,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  label: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const ready = body.trim().length > 0;
  function send(): void {
    if (!ready) return;
    onSubmit(body.trim());
    setBody('');
  }
  function key(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
    if (event.key === 'Escape' && onCancel) onCancel();
  }
  return (
    <div data-reply-input className="flex items-end gap-2">
      <textarea
        aria-label={label}
        rows={1}
        value={body}
        maxLength={REPLY_MAX}
        placeholder="Reply…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={key}
        // Grows with its words, to four lines of 20px and no further.
        className="border-pool-200 text-ink placeholder:text-pool-500 field-sizing-content max-h-[88px] min-w-0 flex-1 resize-none rounded-2xl border bg-white px-3 py-1 text-sm leading-5 outline-none"
      />
      {REPLY_MAX - body.length <= NEAR_LIMIT ? (
        <span className="text-pool-500 pb-1.5 text-[10px] tabular-nums">
          {REPLY_MAX - body.length}
        </span>
      ) : null}
      {onCancel ? (
        <button type="button" onClick={onCancel} className="text-pool-500 pb-1 text-xs">
          Cancel
        </button>
      ) : null}
      {ready ? (
        <button
          type="button"
          data-reply-send
          onClick={send}
          className="text-main-900 pb-1 text-xs font-semibold"
        >
          {onCancel ? 'Save' : 'Send'}
        </button>
      ) : null}
    </div>
  );
}
