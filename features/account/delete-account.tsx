'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { SignInButton } from '@/features/auth/sign-in-button';
import { PoolSheet, SheetTitle } from '@/features/pool/sheet';

import { deleteMyAccount, previewAccountDeletion, type DeletionPreview } from './actions';

/** Where a fresh sign-in comes back to: this sheet, open again. */
const RETURN_TO = '/?settings=home&delete=1';

/**
 * Delete my account (H53), at the very foot of Home's settings in Leave
 * Pool's plain words. The sheet says what goes and what stays, lists each
 * pool I own and who takes it, asks for a sign-in within ten minutes and
 * the word typed. This is the one action that cannot be taken back, so it
 * waits for the server rather than showing itself done.
 */
export function DeleteAccount() {
  // Back from signing in again: the sheet opens where it was.
  const [open, setOpen] = useState(useSearchParams().get('delete') === '1');
  return (
    <section className="border-pool-100 mt-12 border-t pt-6" data-delete-account>
      <button
        type="button"
        data-delete-account-open
        onClick={() => setOpen(true)}
        className="text-pool-500 self-start py-2 text-sm"
      >
        Delete my account
      </button>
      {open ? <DeleteAccountSheet onClose={() => setOpen(false)} /> : null}
    </section>
  );
}

function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signInAgain, setSignInAgain] = useState(false);

  useEffect(() => {
    let live = true;
    void previewAccountDeletion().then((done) => {
      if (!live) return;
      if (done.ok) {
        setPreview(done.preview);
        setSignInAgain(!done.preview.recent);
      } else setMessage(done.message);
    });
    return () => {
      live = false;
    };
  }, []);

  const handed = preview?.pools.filter((p) => p.heirId) ?? [];
  const deleted = preview?.pools.filter((p) => !p.heirId) ?? [];

  return (
    <PoolSheet label="Delete my account" onClose={onClose}>
      <SheetTitle>Delete your account?</SheetTitle>
      {preview === null && !message ? <p className="text-pool-500 text-sm">Loading…</p> : null}
      {preview ? (
        <div className="text-ink flex flex-col gap-5 text-sm/relaxed" data-delete-account-preview>
          <div>
            <h3 className="mb-1 font-semibold">Deleted for good</h3>
            <ul className="text-pool-500 list-disc pl-5">
              <li>
                Your records ({preview.records}) and everything you wrote on anyone’s record, joint
                records included ({preview.ripples})
              </li>
              <li>
                Your replies ({preview.replies}) and reactions ({preview.reactions})
              </li>
              <li>Your photos ({preview.photos}) and your profile photo</li>
              <li>Your lanes ({preview.lanes}), layouts, filings and settings</li>
              <li>Notifications to and from you, on every device</li>
              <li>Invite links you made</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">What stays</h3>
            <p className="text-pool-500">
              What others wrote on your records stays with them, as a joint record of that Pool.
              Layouts you edited in a Pool stay with the Pool.
            </p>
          </div>
          {handed.length > 0 || deleted.length > 0 ? (
            <div data-delete-account-pools>
              <h3 className="mb-1 font-semibold">Pools you own</h3>
              <ul className="text-pool-500 flex flex-col gap-1">
                {handed.map((pool) => (
                  <li key={pool.poolId} data-pool-heir={pool.poolId}>
                    {pool.name}: {pool.heirName ?? 'Someone'} becomes the owner
                  </li>
                ))}
                {deleted.map((pool) => (
                  <li key={pool.poolId} data-pool-deleted={pool.poolId}>
                    {pool.name}: deleted, since you’re its only member
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-pool-500" data-delete-account-backups>
            Encrypted backups keep a copy for up to 60 days, then it’s gone.
          </p>
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-pool-500 mt-4 text-sm">
          {message}
        </p>
      ) : null}

      {preview && signInAgain ? (
        <div className="mt-6 flex flex-col gap-3" data-delete-account-sign-in>
          <p className="text-ink text-sm">
            For your safety, sign in again first. It has been more than 10 minutes.
          </p>
          <SignInButton next={RETURN_TO} />
        </div>
      ) : null}

      {preview && !signInAgain ? (
        <>
          <label className="mt-6 flex flex-col gap-2">
            <span className="text-pool-500 text-xs">Type “delete” to confirm</span>
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              data-delete-account-word
              autoComplete="off"
              autoCapitalize="off"
              className="border-pool-200 text-ink h-12 rounded-xl border px-3 outline-none"
            />
          </label>
          <button
            type="button"
            data-delete-account-confirm
            disabled={typed.trim().toLowerCase() !== 'delete' || busy}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const done = await deleteMyAccount(typed);
              if (!done.ok) {
                setMessage(done.message);
                if (done.signInAgain) setSignInAgain(true);
                setBusy(false);
                return;
              }
              window.location.replace('/sign-in?deleted=1');
            }}
            className="bg-ink mt-5 h-14 w-full rounded-full font-semibold text-white disabled:opacity-30"
          >
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </>
      ) : null}
    </PoolSheet>
  );
}
