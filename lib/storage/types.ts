/**
 * The one shape every storage backend answers to (2026-10-28).
 *
 * Who may see or write an object is never this layer's question: it is asked
 * in our code and SQL (can_see_ripple, visible_avatars, visible_pool_photos,
 * pool membership) before any call here, so the backend can change without
 * changing who sees what. Everything here runs with the backend's full
 * rights, on the server or in a script, never in the browser; the browser
 * only ever holds a signed URL it was issued.
 *
 * Plain types and relative imports only: the backup and restore scripts load
 * these files with Node's own type stripping, no bundler.
 */

export const BUCKETS = ['ripple-media', 'avatars', 'pool-photos'] as const;
export type Bucket = (typeof BUCKETS)[number];

export type BackendName = 'supabase' | 'r2';

export type PutOptions = {
  contentType: string;
  /** Seconds a browser may keep it; a path that never changes can say a year. */
  cacheControl?: number;
  /** Replace what is there. Off by default: a fresh path must not overwrite. */
  upsert?: boolean;
};

export type ObjectInfo = {
  /** The full path inside the bucket. */
  path: string;
  size: number;
  etag: string | null;
  contentType: string | null;
  updatedAt: string | null;
};

/** What the browser sends its bytes with: a PUT, these headers, nothing else. */
export type SignedUpload = { url: string; headers: Record<string, string> };

export type ListPage = { objects: ObjectInfo[]; cursor: string | null };

export interface StorageBackend {
  readonly name: BackendName;
  put(bucket: Bucket, path: string, body: Blob | Uint8Array, opts: PutOptions): Promise<void>;
  get(bucket: Bucket, path: string): Promise<Uint8Array>;
  /** Signed read URLs by path; a path that could not be signed is absent. */
  signedReadUrls(bucket: Bucket, paths: string[], expiresIn: number): Promise<Map<string, string>>;
  signedUploadUrl(bucket: Bucket, path: string, opts: PutOptions): Promise<SignedUpload>;
  /** Hard delete. A path that is not there is not an error. */
  remove(bucket: Bucket, paths: string[]): Promise<void>;
  copy(bucket: Bucket, from: string, to: string): Promise<void>;
  /** Every object under a prefix, flat (folders walked), a page at a time. */
  list(
    bucket: Bucket,
    prefix: string,
    page?: { cursor?: string | null; limit?: number },
  ): Promise<ListPage>;
  stat(bucket: Bucket, path: string): Promise<ObjectInfo | null>;
}
