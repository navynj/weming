'use client';

import type { ReactNode } from 'react';
import { Plus, Settings } from 'lucide-react';

import { Bell } from '@/features/notifications/bell';
import type { BellPlace } from '@/features/notifications/notification-settings-sheet';
import { Avatar } from '@/features/people/avatar';

/** One face in the header: who, and their letters until their photo loads. */
export type HeaderFace = { userId: string; initials: string };

/**
 * The header (0059), one structure on Home and in a pool. Row 1: the place
 * — Home with my face, or the pool's photo or monogram and its name — then
 * the bell, the faces, "+" (a pool's, the invite), the gear. Row 2: the
 * place's tabs. My own face opens my profile; anyone else's, the members.
 */
export function PlaceHeader({
  mark,
  name,
  faces,
  me,
  onMyFace,
  onOtherFace,
  onInvite,
  onSettings,
  tabs,
  bell = null,
}: {
  mark: ReactNode;
  name: string;
  faces: HeaderFace[];
  me: string | null;
  onMyFace: () => void;
  onOtherFace?: () => void;
  onInvite?: () => void;
  onSettings: () => void;
  tabs: ReactNode;
  /** The pool the bell's settings are for; none on Home. */
  bell?: BellPlace;
}) {
  return (
    <header data-place-header className="flex shrink-0 flex-col gap-4 px-4 pt-4 pb-6">
      <div data-place-header-row className="flex items-center gap-2">
        {mark}
        <h1
          data-place-title
          className="min-w-0 flex-1 truncate text-3xl/tight font-semibold text-white"
        >
          {name}
        </h1>
        <Bell place={bell} />
        <span data-place-faces className="flex shrink-0 items-center">
          {faces.map((face, at) => {
            const mine = face.userId === me;
            return (
              <button
                key={face.userId}
                type="button"
                aria-label={mine ? 'My profile' : 'Members'}
                data-place-face={mine ? 'me' : face.userId}
                onClick={mine ? onMyFace : onOtherFace}
                className={`flex ${at > 0 ? '-ml-2' : ''}`}
              >
                <Avatar
                  id={face.userId}
                  initials={face.initials}
                  // Solid, so a face never shows the one beneath it (review).
                  className="text-main-900/60 ring-main-900 bg-joint-face flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-medium ring-2"
                />
              </button>
            );
          })}
        </span>
        {onInvite ? (
          <button
            type="button"
            aria-label="Invite"
            data-pool-invite
            onClick={onInvite}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white"
          >
            <Plus aria-hidden size={16} />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Settings"
          data-place-settings
          onClick={onSettings}
          className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
        >
          <Settings aria-hidden size={20} />
        </button>
      </div>
      <div data-place-tabs className="min-w-0">
        {tabs}
      </div>
    </header>
  );
}
