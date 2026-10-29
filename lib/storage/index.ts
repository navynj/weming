import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env';

import { createStorage } from './backend';
import type { StorageBackend } from './types';

export type { Bucket, ObjectInfo, SignedUpload, StorageBackend } from './types';
export { listAll } from './backend';

/**
 * The app's storage, server side. Every object the app writes, signs or
 * removes goes through here (`tests/storage-boundary.test.ts` holds that).
 * Made inside the call that needs it, never at a module's top level, so a
 * missing key fails as `Missing SUPABASE_SERVICE_ROLE_KEY` at that call and
 * nowhere earlier.
 */
export function storage(): StorageBackend {
  return createStorage({ supabaseUrl: supabaseUrl(), serviceRoleKey: supabaseServiceRoleKey() });
}
