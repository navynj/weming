'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type MouseEvent } from 'react';

import { postIcon, laneOfCard, type Card, type GridColumn } from '@/features/home/grid';
import { splashHref } from '@/features/home/scope';
import { Avatar } from '@/features/people/avatar';
import { usePeople } from '@/features/people/people-provider';
import type { SignedMedia } from '@/lib/media';

import {
  captionOf,
  LABEL_OVERLAP_PX,
  LABEL_PAD_BOTTOM_PX,
  LABEL_PAD_TOP_PX,
  PHOTO_H_PX,
  PHOTO_PAD_PX,
  PHOTO_W_PX,
  STICKER_PX,
  type BoardPiece,
  type PhotoCard,
  type BoardTape,
  type LabelStyle,
} from './layout';

type Lanes = Pick<GridColumn, 'id' | 'icon' | 'name'>[];

/** What a piece needs besides its place: the lanes its icon falls back to, and the guard a pan sets. */
type Shared = {
  lanes: Lanes;
  /** Swallows the click that ends a pan or a pinch, so moving the board never opens a post. */
  onClickCapture: (event: MouseEvent) => void;
};

function placed(box: {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
}): CSSProperties {
  return {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    transform: `rotate(${box.rotate}deg)`,
  };
}

/** The post's own sheet over the board: its page in the pool, or its page from Home. */
function hrefOf(card: Card): string {
  return card.href ?? splashHref(card.splash.id);
}

const LABEL_CLASS: Record<LabelStyle, string> = {
  ink: 'bg-ink text-white rounded-md',
  blue: 'bg-main-900 text-white rounded-md',
  plain: 'text-main-900',
};
const FACE_RING: Record<LabelStyle, string> = {
  ink: 'ring-ink',
  blue: 'ring-main-900',
  plain: 'ring-white',
};
const CAPTION_CLASS = 'line-clamp-2 text-xs/[15px] font-medium break-words';

/** A joint splash's authors, stacked after its caption; on Home, the one author I can see is me. */
function Faces({ card, ring }: { card: Card; ring: string }) {
  const { me } = usePeople();
  const ids = card.branches
    ? [...new Map(card.branches.map((b) => [b.authorId ?? b.initials, b] as const)).values()]
    : me
      ? [{ authorId: me, initials: '' }]
      : [];
  if (ids.length === 0) return null;
  return (
    <span data-board-faces className="ml-1 inline-flex translate-y-0.5 items-center align-baseline">
      {ids.slice(0, 4).map((writer, at) => (
        <Avatar
          key={writer.authorId ?? writer.initials}
          id={writer.authorId}
          initials={writer.initials}
          className={`text-main-900/60 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#8283EE] text-[10px] ring-1 ${ring} ${at > 0 ? '-ml-1' : ''}`}
        />
      ))}
    </span>
  );
}

/** The clamp on a photo's shape: never narrower than 4:5 nor wider than 5:4. */
const RATIO_MIN = 4 / 5;
const RATIO_MAX = 5 / 4;

/**
 * One photo card: a white frame around its image, cropped to the image's own
 * aspect within 4:5 to 5:4 once it has loaded (square until then), standing
 * on the photo area's bottom edge.
 */
function PhotoCardView({
  photo,
  url,
  areaH,
  more,
}: {
  photo: PhotoCard;
  url: string | null | undefined;
  areaH: number;
  more: number;
}) {
  const [ratio, setRatio] = useState(1);
  const innerW = PHOTO_W_PX - PHOTO_PAD_PX * 2;
  const innerH = PHOTO_H_PX - PHOTO_PAD_PX * 2;
  const w = ratio >= 1 ? innerW : Math.min(innerW, innerH * ratio);
  const h = ratio >= 1 ? innerW / ratio : innerH;
  return (
    <span
      data-board-photo-card
      className="absolute block rounded-md bg-white shadow-[0_1px_4px_rgba(22,22,33,0.22)]"
      style={{
        left: photo.dx,
        top: areaH - photo.dy - h - PHOTO_PAD_PX * 2,
        padding: PHOTO_PAD_PX,
        transform: `rotate(${photo.rotate}deg)`,
      }}
    >
      {url ? (
        // A signed URL for a few minutes: next/image would cache it past its life.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          data-board-photo
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth && img.naturalHeight) {
              setRatio(
                Math.min(RATIO_MAX, Math.max(RATIO_MIN, img.naturalWidth / img.naturalHeight)),
              );
            }
          }}
          className="block rounded-sm object-cover"
          style={{ width: w, height: h }}
        />
      ) : (
        <span
          aria-hidden
          data-board-photo-pending
          className="bg-pool-100 block rounded-sm"
          style={{ width: w, height: h }}
        />
      )}
      {more > 0 ? (
        <span
          data-board-more-photos
          className="bg-ink absolute -top-1.5 -right-1.5 rounded-full px-1.5 text-[10px]/4 font-medium text-white"
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A post on its day (Board view): every one is a label with its title, in
 * one of three styles. With photos, up to three cards fan above the label,
 * which overlaps their bottom edge, and the icon is small before the words;
 * without, the icon is a large sticker overhanging a corner of the label.
 */
export function BoardPieceView({
  piece,
  photos,
  lanes,
  onClickCapture,
}: Shared & { piece: BoardPiece; photos: SignedMedia }) {
  const { card } = piece;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  const pictured = piece.variant === 'photo';
  const left = piece.corner === 'left';
  const top = piece.fan.length - 1;
  return (
    <Link
      href={hrefOf(card)}
      scroll={false}
      draggable={false}
      onClickCapture={onClickCapture}
      aria-label={caption}
      data-board-piece={piece.id}
      data-board-day={piece.day}
      data-variant={piece.variant}
      data-label={piece.label}
      data-rotate={piece.rotate}
      className="absolute"
      style={placed(piece)}
    >
      {piece.fan.map((photo, at) => (
        <PhotoCardView
          key={photo.path}
          photo={photo}
          url={photos[photo.path]}
          areaH={piece.labelBox.y + (piece.label === 'plain' ? 0 : LABEL_OVERLAP_PX)}
          more={at === top ? piece.morePhotos : 0}
        />
      ))}
      <span
        data-board-label
        className={`absolute block ${LABEL_CLASS[piece.label]}`}
        style={{
          top: piece.labelBox.y,
          left: piece.labelBox.x,
          width: piece.labelBox.w,
          paddingTop: pictured ? LABEL_PAD_BOTTOM_PX : LABEL_PAD_TOP_PX,
          paddingBottom: LABEL_PAD_BOTTOM_PX,
          paddingLeft: piece.label === 'plain' ? 2 : 10,
          paddingRight: piece.label === 'plain' ? 2 : 10,
        }}
      >
        <span className={CAPTION_CLASS}>
          {pictured && icon ? (
            <span aria-hidden data-board-icon className="mr-1">
              {icon}
            </span>
          ) : null}
          {caption}
          {card.joint ? <Faces card={card} ring={FACE_RING[piece.label]} /> : null}
        </span>
      </span>
      {!pictured && icon ? (
        <span
          aria-hidden
          data-board-sticker
          className="absolute flex items-center justify-center leading-none"
          style={{
            top: 0,
            [left ? 'left' : 'right']: 0,
            width: STICKER_PX,
            height: STICKER_PX,
            fontSize: STICKER_PX,
          }}
        >
          {icon}
        </span>
      ) : null}
    </Link>
  );
}

/** A ranged post's strip across its days in one week row, its caption on the tape. */
export function BoardTapeView({ tape, lanes, onClickCapture }: Shared & { tape: BoardTape }) {
  const { card } = tape;
  const icon = postIcon(card.splash, laneOfCard(card, lanes));
  const caption = captionOf(card);
  return (
    <Link
      href={hrefOf(card)}
      scroll={false}
      draggable={false}
      onClickCapture={onClickCapture}
      aria-label={caption}
      data-board-tape={tape.id}
      data-board-week={tape.week}
      className="bg-main-100/80 text-main-900 absolute flex items-center gap-1 px-2 text-xs font-medium"
      style={placed(tape)}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span className="min-w-0 truncate">{caption}</span>
      {card.joint ? <Faces card={card} ring="ring-main-100" /> : null}
    </Link>
  );
}
