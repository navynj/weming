'use client';

import { useRef, useState } from 'react';

import type { PoolInvite } from '@/lib/queries/pools';
import { siteUrl } from '@/lib/site';

import { createInvite, revokeInvite } from './actions';

type Link = { id: string; token: string; expiresAt: string; off: boolean };

/** "Copied" reads this long, then the button is "Copy link" again. */
const COPIED_MS = 2000;

const untilOf = (link: Link): string =>
  new Date(link.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** The whole URL, the domain with it: the origin is configuration (CLAUDE.md). */
const urlOf = (token: string): string => `${siteUrl()}/join/${token}`;

/**
 * Invite links (H23; plain words, 0059; review). With a working link, its
 * full URL and "Works until" sit over the one blue button, *Copy link* — the
 * share sheet on a phone, the clipboard elsewhere — and *Make a new link*
 * is small under it: a new link does not turn the old one off. Without one
 * (none yet, or all ran out or were turned off), the blue button is *Make a
 * link*, and the link it makes is there at once to copy. Every other link
 * is listed below, a working one with *Turn off link* behind a confirm, a
 * dead one as "This link no longer works". In the pool's `+` sheet.
 */
export function InvitePanel({ poolId, invites }: { poolId: string; invites: PoolInvite[] }) {
  const [links, setLinks] = useState<Link[]>(() =>
    invites
      .map((i) => ({
        id: i.id,
        token: i.token,
        expiresAt: i.expires_at,
        off: i.revoked_at !== null || Date.parse(i.expires_at) <= Date.now(),
      }))
      .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt)),
  );
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The newest working link is the one offered; the rest are listed.
  const current = links.find((l) => !l.off) ?? null;
  const rest = links.filter((l) => l !== current);

  async function make(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const made = await createInvite(poolId);
    setBusy(false);
    if (!made.ok) return setMessage(made.message);
    setCopied(false);
    setLinks((list) => [
      { id: made.id, token: made.token, expiresAt: made.expiresAt, off: false },
      ...list,
    ]);
  }

  /** A phone's share sheet where there is one; otherwise the clipboard, then "Copied". */
  async function copy(link: Link): Promise<void> {
    setMessage(null);
    const url = urlOf(link.token);
    const phone = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (phone && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        return;
      } catch (error) {
        // Closed without sharing: nothing to say. Anything else falls back to copying.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setMessage('Copy did not work here. Select the link and copy it by hand.');
    }
  }

  async function turnOff(link: Link): Promise<void> {
    setConfirming(null);
    const before = links;
    // Off at once; back with a reason if the database refuses.
    setLinks((list) => list.map((l) => (l.id === link.id ? { ...l, off: true } : l)));
    const done = await revokeInvite(poolId, link.id);
    if (!done.ok) {
      setLinks(before);
      setMessage(done.message);
    }
  }

  return (
    <div data-invite-panel className="flex flex-col gap-3">
      {current ? (
        <div data-invite-current data-invite={current.token} className="flex flex-col gap-3">
          <div className="bg-pool-100 flex flex-col gap-1 rounded-xl px-4 py-3">
            <span data-invite-url className="text-ink font-mono text-xs break-all select-all">
              {urlOf(current.token)}
            </span>
            <LinkStatus
              link={current}
              confirming={confirming === current.id}
              onAsk={() => setConfirming(current.id)}
              onCancel={() => setConfirming(null)}
              onTurnOff={() => void turnOff(current)}
            />
          </div>
          <button
            type="button"
            data-copy-invite
            onClick={() => void copy(current)}
            className="bg-main-900 h-12 rounded-full text-sm font-semibold text-white"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            data-create-invite
            disabled={busy}
            onClick={() => void make()}
            className="text-main-900 self-center text-xs font-medium underline underline-offset-2 disabled:opacity-40"
          >
            Make a new link
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-create-invite
          disabled={busy}
          onClick={() => void make()}
          className="bg-main-900 h-12 rounded-full text-sm font-semibold text-white disabled:opacity-40"
        >
          Make a link
        </button>
      )}
      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {rest.map((link) => (
          <LinkRow
            key={link.id}
            link={link}
            confirming={confirming === link.id}
            onAsk={() => setConfirming(link.id)}
            onCancel={() => setConfirming(null)}
            onTurnOff={() => void turnOff(link)}
          />
        ))}
      </ul>
    </div>
  );
}

type StatusProps = {
  link: Link;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onTurnOff: () => void;
};

/** One link in the list: its URL, and whether it works. */
function LinkRow(props: StatusProps) {
  const { link } = props;
  return (
    <li
      data-invite={link.token}
      data-invite-off={link.off ? '' : undefined}
      className="border-pool-100 flex flex-col gap-1 border-b py-3"
    >
      <span
        className={`truncate font-mono text-xs ${link.off ? 'text-pool-500 line-through' : 'text-ink'}`}
      >
        {urlOf(link.token)}
      </span>
      <LinkStatus {...props} />
    </li>
  );
}

/** "Works until", with Turn off link behind a confirm; or that it no longer works. */
function LinkStatus({ link, confirming, onAsk, onCancel, onTurnOff }: StatusProps) {
  return link.off ? (
    <span data-invite-dead className="text-pool-500 text-xs">
      This link no longer works
    </span>
  ) : confirming ? (
    <span
      role="alertdialog"
      aria-label="Turn off this link"
      data-invite-confirm
      className="bg-pool-100 mt-1 flex flex-col gap-3 rounded-xl p-3 text-sm"
    >
      <span className="text-ink">
        Turn off this link? Anyone who has it won’t be able to join with it. You can make a new one
        anytime.
      </span>
      <span className="flex justify-end gap-4">
        <button type="button" onClick={onCancel} className="text-pool-500">
          Cancel
        </button>
        <button
          type="button"
          data-invite-turn-off-confirm
          onClick={onTurnOff}
          className="text-main-900 font-semibold"
        >
          Turn off
        </button>
      </span>
    </span>
  ) : (
    <span className="flex items-center justify-between gap-3 text-xs">
      <span className="text-pool-500">Works until {untilOf(link)}</span>
      <button type="button" data-revoke-invite onClick={onAsk} className="text-pool-500">
        Turn off link
      </button>
    </span>
  );
}
