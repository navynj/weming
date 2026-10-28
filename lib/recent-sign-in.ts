/** How long ago a sign-in still counts for deleting the account (H53). */
export const RECENT_SIGN_IN_SECONDS = 10 * 60;

type AmrEntry = { method?: string; timestamp?: number };

/**
 * When this session last signed in, from the token's `amr` claim: each
 * method with the moment it was used, kept as the token refreshes (unlike
 * `iat`, which moves every hour). Null when the token carries none.
 */
export function signedInAt(claims: { amr?: unknown } | null | undefined): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr.flatMap((entry: AmrEntry | string) =>
    typeof entry === 'object' && entry && typeof entry.timestamp === 'number'
      ? [entry.timestamp]
      : [],
  );
  return times.length > 0 ? Math.max(...times) : null;
}

/** Signed in within the last ten minutes; a token with no sign-in time never is. */
export function signedInRecently(
  claims: { amr?: unknown } | null | undefined,
  nowSeconds: number = Date.now() / 1000,
): boolean {
  const at = signedInAt(claims);
  return at !== null && nowSeconds - at <= RECENT_SIGN_IN_SECONDS;
}
