'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { LinkedText } from '@/components/ui/linked-text';

/**
 * A splash's description (0037, Yoonji, in the session): optional, so it
 * shows only when written, or once Add description is chosen from the
 * header's menu (review: a standing "+ Add description" read as adding a
 * block); then it opens as the field, its placeholder faint. It sits under
 * the header, set apart from the ripples by a divider. Saved when the field
 * is left; Escape keeps what was there.
 */
export function SplashDescription({
  value,
  editable,
  opened = false,
  onSave,
  onEmpty,
}: {
  value: string | null;
  editable: boolean;
  /** Asked for just now: the field open from the start. */
  opened?: boolean;
  onSave: (text: string) => void;
  /** Left with no words and none saved: the field is hidden again. */
  onEmpty?: () => void;
}) {
  const [editing, setEditing] = useState(opened);
  const [draft, setDraft] = useState(value ?? '');
  const field = useRef<HTMLTextAreaElement>(null);

  // The field grows with its words.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  if (!value && !editing) return null;

  function open(): void {
    setDraft(value ?? '');
    setEditing(true);
  }

  function close(save: boolean): void {
    setEditing(false);
    const next = draft.trim();
    if (save && next !== (value ?? '')) onSave(next);
    if (!next && !value) onEmpty?.();
  }

  return (
    <div data-splash-description-block className="border-pool-100 mb-4 border-b pb-4">
      {editing ? (
        <textarea
          ref={field}
          value={draft}
          autoFocus
          rows={2}
          maxLength={2000}
          aria-label="Description"
          data-splash-description-field
          placeholder="Describe this splash"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => close(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setDraft(value ?? '');
              setEditing(false);
              if (!value) onEmpty?.();
            }
          }}
          className="text-ink placeholder:text-ink w-full resize-none text-sm/relaxed outline-none placeholder:opacity-30"
        />
      ) : value ? (
        editable ? (
          <button
            type="button"
            data-splash-description
            aria-label="Edit the description"
            onClick={open}
            className="text-ink/80 block w-full text-left text-sm/relaxed whitespace-pre-wrap"
          >
            {value}
          </button>
        ) : (
          <p data-splash-description className="text-ink/80 text-sm/relaxed whitespace-pre-wrap">
            <LinkedText text={value} />
          </p>
        )
      ) : null}
    </div>
  );
}
