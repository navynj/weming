'use client';

import type { ReactNode } from 'react';

/**
 * A web address in what someone wrote: `http(s)://…` or `www.…`, up to the
 * next space. Sentence punctuation after it is the sentence's, not the link's.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING = /[.,;:!?'")\]}>]+$/;

/** The pieces of a text: plain runs and links, in order. */
export function linkPieces(text: string): ({ text: string } | { href: string; text: string })[] {
  const pieces: ({ text: string } | { href: string; text: string })[] = [];
  let at = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const raw = match[0];
    const url = raw.replace(TRAILING, '');
    if (start > at) pieces.push({ text: text.slice(at, start) });
    pieces.push({ href: /^https?:\/\//i.test(url) ? url : `https://${url}`, text: url });
    at = start + url.length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

/**
 * Text with its web addresses as links (review: "a link in the body opens
 * at once"), each in a new tab. A tap on one is the link's alone: it never
 * opens the post or turns the card it sits on, and it takes the tap even
 * where the text around it lets taps through to the card beneath.
 */
export function LinkedText({ text }: { text: string }): ReactNode {
  return linkPieces(text).map((piece, at) =>
    'href' in piece ? (
      <a
        key={at}
        href={piece.href}
        target="_blank"
        rel="noopener noreferrer"
        data-linked
        className="text-main-900 pointer-events-auto break-all underline underline-offset-2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {piece.text}
      </a>
    ) : (
      piece.text
    ),
  );
}
