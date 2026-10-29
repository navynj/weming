/**
 * A uuid as 22 base58 characters, and back (H62): the URL's form of a key,
 * never a key. Pure, with no imports, so `scripts/id.ts` runs it in Node
 * directly.
 *
 * Fixed width: a uuid whose value is small is padded with the alphabet's
 * zero ('1'), so every short id is exactly 22 characters and each uuid has
 * one spelling. The alphabet leaves out 0, O, I and l.
 */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const WIDTH = 22;
const BASE = BigInt(58);
const LIMIT = BigInt(2) ** BigInt(128);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[1-9A-HJ-NP-Za-km-z]{22}$/;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** The shape only; a 22-character string past 2^128 is still not one (fromShortId). */
export function isShortId(value: string): boolean {
  return SHORT.test(value);
}

/** A uuid, in either case, as its short id. Throws on anything else. */
export function toShortId(uuid: string): string {
  if (!isUuid(uuid)) throw new Error('toShortId: not a uuid');
  let n = BigInt(`0x${uuid.replace(/-/g, '')}`);
  let out = '';
  while (n > BigInt(0)) {
    out = ALPHABET[Number(n % BASE)] + out;
    n /= BASE;
  }
  return out.padStart(WIDTH, ALPHABET[0]);
}

/** A short id as its uuid, lowercase; null for anything that is not one. */
export function fromShortId(short: string): string | null {
  if (!isShortId(short)) return null;
  let n = BigInt(0);
  for (const char of short) n = n * BASE + BigInt(ALPHABET.indexOf(char));
  if (n >= LIMIT) return null;
  const hex = n.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
