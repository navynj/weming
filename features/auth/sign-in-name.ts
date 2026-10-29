import { NAME_MAX } from '@/features/people/name';

/**
 * The name a first sign-in starts with: Google's full name, else its given
 * name, else the email's local part. A blank one is passed over, never stored
 * (`??` let an empty `full_name` through), so a Google sign-up always reaches
 * an invite with a name and the join screen never has to ask (2026-10-29).
 * Empty only when none of them has a letter; the join screen asks then.
 */
export function signInName(metadata: Record<string, unknown>, email: string | undefined): string {
  const candidates = [metadata.full_name, metadata.name, email?.split('@')[0]];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed.slice(0, NAME_MAX).trim();
  }
  return '';
}
