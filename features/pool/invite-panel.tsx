'use client';

import { useState } from 'react';

import type { PoolInvite } from '@/lib/queries/pools';

import { createInvite, revokeInvite } from './actions';

type Link = { id: string; token: string; expiresAt: string; off: boolean };

/**
 * Invite links (H23; plain words, 0059): *Make a link* makes one that works
 * for seven days; a working link can be copied or turned off, after a
 * confirm; a link that was turned off or ran out stays in the list as
 * "This link no longer works". In the pool's `+` sheet. The origin comes
 * from the page, never from source (CLAUDE.md: the deployment's origin is
 * configuration).
 */
export function InvitePanel({ poolId, invites }: { poolId: string; invites: PoolInvite[] }) {
  const [links, setLinks] = useState<Link[]>(() =>
    invites.map((i) => ({
      id: i.id,
      token: i.token,
      expiresAt: i.expires_at,
      off: i.revoked_at !== null || Date.parse(i.expires_at) <= Date.now(),
    })),
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkOf = (token: string): string => `${window.location.origin}/join/${token}`;

  async function turnOff(link: Link): Promise<void> {
    setConfirming(null);
    const before = links;
    // Off at once; back with a reason if the database refuses.
    setLinks((current) => current.map((l) => (l.id === link.id ? { ...l, off: true } : l)));
    const done = await revokeInvite(poolId, link.id);
    if (!done.ok) {
      setLinks(before);
      setMessage(done.message);
    }
  }

  return (
    <div data-invite-panel className="flex flex-col gap-3">
      <button
        type="button"
        data-create-invite
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const made = await createInvite(poolId);
          setBusy(false);
          if (!made.ok) return setMessage(made.message);
          setLinks((current) => [
            { id: made.id, token: made.token, expiresAt: made.expiresAt, off: false },
            ...current,
          ]);
        }}
        className="bg-main-900 h-12 rounded-full text-sm font-semibold text-white disabled:opacity-40"
      >
        Make a link
      </button>
      {message ? (
        <p role="alert" className="text-pool-500 text-sm">
          {message}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {links.map((link) => (
          <li
            key={link.id}
            data-invite={link.token}
            data-invite-off={link.off ? '' : undefined}
            className="border-pool-100 flex flex-col gap-1 border-b py-3"
          >
            <span
              className={`truncate font-mono text-xs ${link.off ? 'text-pool-500 line-through' : 'text-ink'}`}
            >
              /join/{link.token}
            </span>
            {link.off ? (
              <span data-invite-dead className="text-pool-500 text-xs">
                This link no longer works
              </span>
            ) : confirming === link.id ? (
              <span
                role="alertdialog"
                aria-label="Turn off this link"
                data-invite-confirm
                className="bg-pool-100 mt-1 flex flex-col gap-3 rounded-xl p-3 text-sm"
              >
                <span className="text-ink">
                  Turn off this link? Anyone who has it won’t be able to join with it. You can make
                  a new one anytime.
                </span>
                <span className="flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-pool-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-invite-turn-off-confirm
                    onClick={() => void turnOff(link)}
                    className="text-main-900 font-semibold"
                  >
                    Turn off
                  </button>
                </span>
              </span>
            ) : (
              <span className="flex items-center justify-between gap-3 text-xs">
                <span className="text-pool-500">
                  Works until{' '}
                  {new Date(link.expiresAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="flex gap-4">
                  <button
                    type="button"
                    data-copy-invite
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(linkOf(link.token));
                        setCopied(link.token);
                      } catch {
                        setMessage('Copy did not work here. Select the link and copy it by hand.');
                      }
                    }}
                    className="text-main-900 font-semibold"
                  >
                    {copied === link.token ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    data-revoke-invite
                    onClick={() => setConfirming(link.id)}
                    className="text-pool-500"
                  >
                    Turn off link
                  </button>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
