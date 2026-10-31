import { MEDIA_BUCKET } from '@/lib/media-bucket';
import { storage } from '@/lib/storage';

/**
 * A week (2026-10-30). A URL that changes on every render defeats the
 * browser's cache and the CDN's: five-minute URLs fetched the same photo
 * three times a session, 37 MB in 35 seconds. An object's path never changes
 * (a fresh id per upload), so one URL per object can be handed out until it
 * nears its end, as faces are (lib/avatars.ts). The visibility check still
 * runs before every hand-out; what a week buys a leaked URL is that object.
 */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Reissued once less than this is left; the browser's cache (lib/media-url-cache) trusts a little less. */
const REISSUE_BEFORE_MS = 24 * 60 * 60 * 1000;
/** A bound on this server's memory: past it, the oldest issued go first. */
const ISSUED_MAX = 5000;

/**
 * Per (backend, object) on this server: the same object is the same URL
 * across renders and requests, so the browser's copy answers. Holds no
 * decision about who may see it: that is asked before every read of it.
 */
const issued = new Map<string, { url: string; expires: number }>();

export function clearSignedMediaCache(): void {
  issued.clear();
}

/**
 * URLs by object, from this server's cache where one has time left, the rest
 * signed in one call. Only after the caller's visibility check (lib/media.ts):
 * this answers for any object it is asked about.
 */
export async function signMediaObjects(objects: string[]): Promise<Map<string, string>> {
  const backend = storage();
  const now = Date.now();
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const object of new Set(objects)) {
    const hit = issued.get(`${backend.name}:${object}`);
    if (hit && hit.expires - now > REISSUE_BEFORE_MS) out.set(object, hit.url);
    else missing.push(object);
  }
  if (missing.length === 0) return out;

  const signed = await backend.signedReadUrls(MEDIA_BUCKET, missing, SIGNED_URL_TTL_SECONDS);
  const expires = now + SIGNED_URL_TTL_SECONDS * 1000;
  for (const [object, url] of signed) {
    const key = `${backend.name}:${object}`;
    issued.delete(key);
    issued.set(key, { url, expires });
    out.set(object, url);
  }
  // A Map iterates in insertion order, so the first keys are the oldest issued.
  for (const key of issued.keys()) {
    if (issued.size <= ISSUED_MAX) break;
    issued.delete(key);
  }
  return out;
}
