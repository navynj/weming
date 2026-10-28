'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import type { BoardLayoutJson } from './board-layout';
import { defaultPartOrder, partOrder } from './stacking';

/**
 * Within this post (0055): its parts on the board, front first — the label,
 * the icon's sticker, each photo, the wave — what is hidden not among them.
 * A part picked here moves up (over the one above it) or down; the whole
 * order is saved as the layout's `order`, back to front.
 */
export function PartOrder({
  layout,
  photos,
  sticker,
  onEdit,
}: {
  layout: BoardLayoutJson;
  /** The post's photos in the order they were uploaded. */
  photos: string[];
  /** Whether the icon stands as a sticker (not inline in the label). */
  sticker: boolean;
  onEdit: (patch: BoardLayoutJson) => void;
}) {
  const present = defaultPartOrder({
    label: layout.label?.hidden !== true,
    photos: photos.filter((path) => layout.photos?.[path]?.hidden !== true),
    wave: layout.wave?.on === true,
    icon: sticker && layout.icon?.hidden !== true,
  });
  const order = partOrder(layout.order, present);
  const [picked, setPicked] = useState<string | null>(null);
  if (order.length < 2) return null;
  const at = picked ? order.indexOf(picked) : -1;
  const move = (by: 1 | -1): void => {
    const next = [...order];
    [next[at], next[at + by]] = [next[at + by], next[at]];
    onEdit({ order: next });
  };
  const nameOf = (key: string): string =>
    key === 'label'
      ? 'Label'
      : key === 'icon'
        ? 'Icon'
        : key === 'wave'
          ? 'Wave'
          : key.startsWith('photo:yt:')
            ? // A video its words link to (part 5).
              `Video ${photos.filter((p) => p.startsWith('yt:')).indexOf(key.slice('photo:'.length)) + 1}`
            : `Photo ${photos.filter((p) => !p.startsWith('yt:')).indexOf(key.slice('photo:'.length)) + 1}`;

  // Its own heading, as the panel's groups have: none for a post of one part.
  return (
    <section data-layout-group="Within this post" className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold text-white">Within this post</h3>
      <div data-part-order className="flex items-start gap-2">
        <ol className="flex min-w-0 flex-1 flex-col gap-1">
          {[...order].reverse().map((key) => (
            <li key={key}>
              <button
                type="button"
                aria-pressed={key === picked}
                data-part-order-item={key}
                onClick={() => setPicked(key === picked ? null : key)}
                // Selection is ink (H20f).
                className={`w-full rounded-full px-3 py-1 text-left text-xs ${
                  key === picked ? 'bg-ink text-white' : 'text-white/80'
                }`}
              >
                {nameOf(key)}
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label="Move up"
            data-part-order-up
            disabled={at < 0 || at === order.length - 1}
            onClick={() => move(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-30"
          >
            <ArrowUp aria-hidden size={14} />
          </button>
          <button
            type="button"
            aria-label="Move down"
            data-part-order-down
            disabled={at <= 0}
            onClick={() => move(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white disabled:opacity-30"
          >
            <ArrowDown aria-hidden size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
