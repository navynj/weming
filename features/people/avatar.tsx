'use client';

import type { CSSProperties } from 'react';

import { initialsOf } from '@/features/home/grid';
import { useStableUrl } from '@/lib/use-stable-media';

import { usePeople } from './people-provider';

/**
 * A person, wherever one is shown (0018): their photo, else their initials.
 * `id` finds them in the shell's faces, so a name or photo change reaches
 * every avatar at once; `initials` is what a caller already knew, drawn
 * when the shell does not know the person (or has no `id` to give).
 * `className` sizes and colours the disc; a photo fills it, cropped round.
 */
export function Avatar({
  id,
  initials,
  className = '',
  style,
}: {
  id?: string | null;
  initials: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { people } = usePeople();
  const person = id ? people[id] : undefined;
  // The URL this browser keeps for the photo's version, whichever server
  // instance signed this one (2026-10-30): its bytes come from the cache.
  const photo = useStableUrl(person?.photo ?? null);
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        aria-hidden
        data-avatar-photo
        draggable={false}
        className={`${className} rounded-full object-cover`}
        style={style}
      />
    );
  }
  return (
    <span aria-hidden className={className} style={style}>
      {person ? initialsOf(person.name) : initials}
    </span>
  );
}

/** A person's name as text, current with their latest edit. */
export function PersonName({ id, name }: { id?: string | null; name: string }) {
  const { people } = usePeople();
  return <>{(id && people[id]?.name) || name}</>;
}
