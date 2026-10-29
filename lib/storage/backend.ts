import { createClient } from '@supabase/supabase-js';

import type {
  BackendName,
  Bucket,
  ListPage,
  ObjectInfo,
  PutOptions,
  SignedUpload,
  StorageBackend,
} from './types';

/**
 * Storage backends, and the one place that picks between them.
 *
 * `STORAGE_BACKEND` chooses (`supabase` by default). R2 is the planned second
 * implementation (ROADMAP): an S3 client against the account's endpoint,
 * presigned PUT and GET, the same interface. It is not built yet, so naming
 * it fails loudly rather than falling back to a backend nobody chose.
 *
 * Plain TypeScript, relative imports: `scripts/backup-storage.mjs` and its
 * siblings import this file directly under Node's type stripping.
 */

/** Supabase removes at most this many paths per call. */
const REMOVE_BATCH = 1000;

export type StorageConfig = { supabaseUrl: string; serviceRoleKey: string };

export function backendName(value: string | undefined = process.env.STORAGE_BACKEND): BackendName {
  if (!value || value === 'supabase') return 'supabase';
  if (value === 'r2') return 'r2';
  throw new Error(`Unknown STORAGE_BACKEND "${value}" (supabase or r2)`);
}

export function createStorage(
  config: StorageConfig,
  name: BackendName = backendName(),
): StorageBackend {
  if (name === 'r2') throw new Error('STORAGE_BACKEND=r2 is not implemented yet');
  return supabaseBackend(config);
}

/** Storage's error, as an Error: its own message, never the path. */
function failed(action: string, error: { message?: string } | null | undefined): Error {
  return new Error(`storage ${action} failed: ${error?.message ?? 'no reason given'}`);
}

type Meta = Record<string, unknown> | null | undefined;

function infoOf(path: string, meta: Meta, updatedAt: string | null): ObjectInfo {
  const size = Number(meta?.size ?? meta?.contentLength ?? 0);
  return {
    path,
    size: Number.isFinite(size) ? size : 0,
    etag: typeof meta?.eTag === 'string' ? meta.eTag : null,
    contentType: typeof meta?.mimetype === 'string' ? meta.mimetype : null,
    updatedAt,
  };
}

export function supabaseBackend({ supabaseUrl, serviceRoleKey }: StorageConfig): StorageBackend {
  const storage = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }).storage;

  return {
    name: 'supabase',

    async put(bucket: Bucket, path: string, body: Blob | Uint8Array, opts: PutOptions) {
      const { error } = await storage.from(bucket).upload(path, body, {
        contentType: opts.contentType,
        cacheControl: String(opts.cacheControl ?? 3600),
        upsert: opts.upsert ?? false,
      });
      if (error) throw failed('put', error);
    },

    async get(bucket: Bucket, path: string) {
      // A read for a backup or a rewrite must see the bytes stored now: the
      // CDN keys the download by URL and served the old bytes of an object
      // overwritten in place (the metadata scrub, 2026-10-29). A fresh nonce
      // per read keeps it from answering.
      const { data, error } = await storage
        .from(bucket)
        .download(path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
      if (error || !data) throw failed('get', error);
      return new Uint8Array(await data.arrayBuffer());
    },

    async signedReadUrls(bucket: Bucket, paths: string[], expiresIn: number) {
      const signed = new Map<string, string>();
      if (paths.length === 0) return signed;
      const { data, error } = await storage.from(bucket).createSignedUrls(paths, expiresIn);
      if (error) throw failed('sign', error);
      for (const entry of data) {
        if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
      return signed;
    },

    async signedUploadUrl(bucket: Bucket, path: string, opts: PutOptions): Promise<SignedUpload> {
      const upsert = opts.upsert ?? false;
      const { data, error } = await storage.from(bucket).createSignedUploadUrl(path, { upsert });
      if (error || !data) throw failed('sign upload', error);
      // What storage-js's uploadToSignedUrl sends for a raw body; a plain
      // PUT, so the browser needs no client library and no key.
      return {
        url: data.signedUrl,
        headers: {
          'content-type': opts.contentType,
          'cache-control': `max-age=${opts.cacheControl ?? 3600}`,
          'x-upsert': String(upsert),
        },
      };
    },

    async remove(bucket: Bucket, paths: string[]) {
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) throw failed('remove', error);
      }
    },

    async copy(bucket: Bucket, from: string, to: string) {
      const { error } = await storage.from(bucket).copy(from, to);
      if (error) throw failed('copy', error);
    },

    async list(bucket: Bucket, prefix: string, page = {}): Promise<ListPage> {
      // list-v2, flat: every object under the prefix with its full path, and
      // a cursor rather than an offset, as S3's continuation token will be.
      const { data, error } = await storage.from(bucket).listV2({
        prefix,
        limit: page.limit ?? 1000,
        ...(page.cursor ? { cursor: page.cursor } : {}),
        with_delimiter: false,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error || !data) throw failed('list', error);
      return {
        objects: data.objects.map((o) => infoOf(o.key ?? o.name, o.metadata, o.updated_at)),
        cursor: data.hasNext && data.nextCursor ? data.nextCursor : null,
      };
    },

    async stat(bucket: Bucket, path: string) {
      const { data, error } = await storage.from(bucket).info(path);
      if (error) {
        if (/not.?found|404/i.test(`${error.message} ${'status' in error ? error.status : ''}`)) {
          return null;
        }
        throw failed('stat', error);
      }
      return {
        path,
        size: Number(data.size ?? 0),
        etag: data.etag ?? null,
        contentType: data.contentType ?? null,
        updatedAt: data.lastModified ?? data.updatedAt ?? null,
      };
    },
  };
}

/** Every object under a prefix, all pages followed. */
export async function listAll(
  backend: StorageBackend,
  bucket: Bucket,
  prefix = '',
): Promise<ObjectInfo[]> {
  const all: ObjectInfo[] = [];
  let cursor: string | null = null;
  do {
    const page: ListPage = await backend.list(bucket, prefix, { cursor });
    all.push(...page.objects);
    cursor = page.cursor;
  } while (cursor);
  return all;
}
