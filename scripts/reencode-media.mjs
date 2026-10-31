#!/usr/bin/env node
// Draws the photos already in `ripple-media` again the way an upload draws
// them now (2026-10-30, scripts/media-copies.mjs): a one-off for photos from
// before the browser made them small — some PNGs are megabytes, and a photo
// with no display copy was loaded whole on every board.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON scripts/reencode-media.mjs \
//       [--ripple <id>] [--apply]
//
// Two kinds of work, per photo a ripple names:
//   - over 300 KB: drawn again as WebP at most 1600px, with a 1024px display
//     copy and a 400px thumbnail, at a new path; every ripple naming it is
//     moved to the new path and its sizes (`media_meta`), and only then are
//     the old object and its copies removed. A cutout still over 500 KB at
//     1600px goes at 1024px. When the result is not smaller, it is left alone.
//   - otherwise, with no thumbnail yet and larger than 400px: a thumbnail
//     beside it (`.t`, in its own format), and its sizes on the row.
//
// Without --apply it writes nothing. It downloads the photos over 300 KB
// (the total is printed first) to report each one's size before and after,
// and counts the rest. Never a path: object paths carry user ids. Photos are
// numbered instead.
//
// With --apply it needs a backup from today in backups/ (pnpm backup), names
// the project and waits for its ref to be typed. A row that changed since it
// was read is left as it is, and what was uploaded for it removed. Run again,
// it finds nothing left to do.
//
// --ripple <id> does only the photos that ripple names, to check one in the
// app before the rest. A photo another ripple names too moves for both.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

import { createStorage, listAll } from '../lib/storage/backend.ts';
import {
  CONTENT_TYPES,
  copyPathOf,
  formatOfPath,
  REENCODE_OVER_BYTES,
  THUMB_EDGE,
  thumbLike,
  webpCopies,
} from './media-copies.mjs';

const apply = process.argv.includes('--apply');
const rippleAt = process.argv.indexOf('--ripple');
const onlyRipple = rippleAt === -1 ? null : process.argv[rippleAt + 1];
if (rippleAt !== -1 && !/^[0-9a-f-]{36}$/i.test(onlyRipple ?? '')) {
  console.error('✖ --ripple takes a ripple id (a uuid).');
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    '✖ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (values are never printed).',
  );
  process.exit(2);
}
const ref = new URL(url).hostname.split('.')[0];
const storage = createStorage({ supabaseUrl: url, serviceRoleKey: key });
const db = createClient(url, key, { auth: { persistSession: false } });

const BUCKET = 'ripple-media';
/** The upload's own (features/input-sheet/upload-actions.ts): a path never changes. */
const IMMUTABLE_SECONDS = 365 * 24 * 60 * 60;
const PARALLEL = 4;
const PAGE = 1000;

if (apply) {
  // Local, as scripts/backup.sh stamps its files (`date +%Y%m%d`): never UTC.
  const now = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  let backups = [];
  try {
    backups = readdirSync('backups').filter((name) => name.startsWith(`${today}-`));
  } catch {
    // No backups folder: refused below.
  }
  if (backups.length === 0) {
    console.error('✖ No backup from today in backups/. Run `pnpm backup` first.');
    process.exit(1);
  }
  console.log(`Re-encode photos in ${BUCKET} of project ${ref}, moving the rows that name them.`);
  const ask = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await ask.question(`Type the project ref (${ref}) to go ahead: `)).trim();
  ask.close();
  if (typed !== ref) {
    console.error('✖ Not confirmed; nothing was written.');
    process.exit(1);
  }
}

function kb(bytes) {
  if (bytes === 0) return '0 KB';
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const isStoragePath = (path) => !path.startsWith('yt:') && !path.startsWith('app:');

// ── What is stored, and what names it ────────────────────────────────────
const objects = new Map((await listAll(storage, BUCKET)).map((o) => [o.path, o]));

const rows = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await db
    .from('ripples')
    .select('id, media, media_meta')
    .neq('media', '{}')
    .order('id')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`reading ripples failed: ${error.message}`);
  rows.push(...data);
  if (data.length < PAGE) break;
}

/** Per photo path: the rows naming it, and what the first row knows of its sizes. */
const photos = new Map();
for (const row of rows) {
  for (const path of row.media) {
    if (!isStoragePath(path)) continue;
    const photo = photos.get(path) ?? { path, rowIds: [], entry: null };
    photo.rowIds.push(row.id);
    photo.entry ??= row.media_meta?.[path] ?? null;
    photos.set(path, photo);
  }
}

if (onlyRipple) {
  const row = rows.find((r) => r.id === onlyRipple);
  if (!row) {
    console.error('✖ That ripple names no photo (or does not exist).');
    process.exit(1);
  }
  for (const path of photos.keys()) if (!row.media.includes(path)) photos.delete(path);
}

const tally = {
  photos: photos.size,
  missing: 0,
  gif: 0,
  unknownFormat: 0,
  done: 0,
  reencode: [],
  thumbOnly: [],
};
for (const photo of photos.values()) {
  const info = objects.get(photo.path);
  const format = formatOfPath(photo.path);
  if (!info) tally.missing += 1;
  else if (format === 'gif') tally.gif += 1;
  else if (!format) tally.unknownFormat += 1;
  else if (info.size > REENCODE_OVER_BYTES) tally.reencode.push({ ...photo, info, format });
  else if (
    !photo.entry?.t &&
    (!photo.entry || Math.max(photo.entry.w, photo.entry.h) > THUMB_EDGE)
  ) {
    tally.thumbOnly.push({ ...photo, info, format });
  } else tally.done += 1;
}
tally.reencode.sort((a, b) => b.info.size - a.info.size);

const named = new Set(
  [...photos.keys()].flatMap((p) => [p, copyPathOf(p, 'd'), copyPathOf(p, 't')]),
);
const orphans = [...objects.values()].filter((o) => !named.has(o.path));
const reencodeBytes = tally.reencode.reduce((sum, p) => sum + p.info.size, 0);

console.log(
  (apply ? `Applying to ${ref}` : `Dry run on ${ref} (nothing written)`) +
    (onlyRipple ? ', one ripple only' : ''),
);
console.log(
  `  ${tally.photos} photos named by ${rows.length} ripples; ${objects.size} objects stored`,
);
console.log(
  `  over ${kb(REENCODE_OVER_BYTES)}, to draw again: ${tally.reencode.length} (${kb(reencodeBytes)})`,
);
console.log(`  a thumbnail to add: ${tally.thumbOnly.length}`);
console.log(
  `  already fine: ${tally.done}; GIF, left as is: ${tally.gif}; ` +
    `unknown format: ${tally.unknownFormat}; named but not stored: ${tally.missing}`,
);
if (!onlyRipple) {
  console.log(
    `  stored but named by no ripple (left alone): ${orphans.length} ` +
      `(${kb(orphans.reduce((s, o) => s + o.size, 0))})`,
  );
}
if (tally.reencode.length > 0) {
  console.log(`\nDownloading ${kb(reencodeBytes)} to measure each one:`);
}

// ── Measure, and in --apply write ────────────────────────────────────────
const result = { moved: 0, skipped: 0, raced: 0, failed: 0, thumbs: 0, before: 0, after: 0 };

async function updateRow(id, change) {
  const { data: row, error } = await db
    .from('ripples')
    .select('media, media_meta')
    .eq('id', id)
    .maybeSingle();
  if (error || !row) return false;
  const next = change(row);
  if (!next) return false;
  // Only if nobody changed its photos in between: else it is left as it is.
  const { data: updated, error: updateError } = await db
    .from('ripples')
    .update(next)
    .eq('id', id)
    .eq('media', `{${row.media.join(',')}}`)
    .select('id');
  return !updateError && updated.length === 1;
}

async function reencode(photo, index) {
  const label = `#${String(index + 1).padStart(3)}`;
  let copies;
  try {
    copies = await webpCopies(await storage.get(BUCKET, photo.path));
  } catch (error) {
    result.failed += 1;
    console.log(`  ${label} ${photo.format} ${kb(photo.info.size)}: unreadable (${error.message})`);
    return;
  }
  const { source, full, display, thumb, capped } = copies;
  const line =
    `  ${label} ${photo.format.padEnd(4)} ${String(`${source.w}×${source.h}`).padEnd(10)} ` +
    `${kb(photo.info.size).padStart(7)} → webp ${`${full.size.w}×${full.size.h}`.padEnd(10)} ` +
    `${kb(full.bytes.length).padStart(7)}` +
    (display ? `, display ${kb(display.bytes.length)}` : '') +
    (thumb ? `, thumb ${kb(thumb.bytes.length)}` : '') +
    (capped ? '  (cutout capped at 1024)' : '') +
    (photo.rowIds.length > 1 ? `  (${photo.rowIds.length} ripples)` : '');
  if (full.bytes.length >= photo.info.size) {
    result.skipped += 1;
    console.log(`${line}  — not smaller, left alone`);
    return;
  }
  result.before += photo.info.size;
  result.after += full.bytes.length;
  console.log(line);
  if (!apply) return;

  const owner = photo.path.slice(0, photo.path.indexOf('/'));
  const next = `${owner}/${randomUUID()}.webp`;
  const written = [next];
  const put = (path, copy) =>
    storage.put(BUCKET, path, copy.bytes, {
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_SECONDS,
    });
  try {
    await put(next, full);
    if (display)
      await put(copyPathOf(next, 'd'), display).then(() => written.push(copyPathOf(next, 'd')));
    if (thumb)
      await put(copyPathOf(next, 't'), thumb).then(() => written.push(copyPathOf(next, 't')));
  } catch (error) {
    result.failed += 1;
    console.log(`  ${label} upload failed (${error.message}); nothing moved`);
    await storage.remove(BUCKET, written).catch(() => {});
    return;
  }
  const entry = {
    ...full.size,
    ...(display ? { d: display.size } : {}),
    ...(thumb ? { t: thumb.size } : {}),
  };
  let moved = 0;
  for (const id of photo.rowIds) {
    const ok = await updateRow(id, (row) => {
      if (!row.media.includes(photo.path)) return null;
      const meta = { ...(row.media_meta ?? {}) };
      delete meta[photo.path];
      meta[next] = entry;
      return { media: row.media.map((p) => (p === photo.path ? next : p)), media_meta: meta };
    });
    if (ok) moved += 1;
  }
  if (moved === photo.rowIds.length) {
    await storage.remove(BUCKET, [
      photo.path,
      copyPathOf(photo.path, 'd'),
      copyPathOf(photo.path, 't'),
    ]);
    result.moved += 1;
  } else if (moved === 0) {
    // Nothing points at the new copies: they go, the old photo stays.
    await storage.remove(BUCKET, written);
    result.raced += 1;
    console.log(`  ${label} its ripple changed meanwhile; left as it was`);
  } else {
    // Some rows moved, some did not: both objects are named, so both stay.
    result.raced += 1;
    console.log(`  ${label} ${moved}/${photo.rowIds.length} ripples moved; old photo kept`);
  }
}

async function addThumb(photo) {
  // The smallest copy that is there: the display copy when the row has one.
  const from = photo.entry?.d ? copyPathOf(photo.path, 'd') : photo.path;
  let made;
  try {
    made = await thumbLike(await storage.get(BUCKET, from), photo.format);
  } catch {
    result.failed += 1;
    return;
  }
  if (!made.thumb) return;
  const thumbPath = copyPathOf(photo.path, 't');
  try {
    await storage.put(BUCKET, thumbPath, made.thumb.bytes, {
      contentType: CONTENT_TYPES[photo.format],
      cacheControl: IMMUTABLE_SECONDS,
      upsert: true,
    });
  } catch {
    result.failed += 1;
    return;
  }
  for (const id of photo.rowIds) {
    await updateRow(id, (row) => {
      if (!row.media.includes(photo.path)) return null;
      const meta = { ...(row.media_meta ?? {}) };
      // A photo from before 0070 learns its size here too, from the original.
      const known = meta[photo.path] ?? (from === photo.path ? made.source : null);
      if (!known) return null;
      meta[photo.path] = { ...known, t: made.thumb.size };
      return { media_meta: meta };
    });
  }
  result.thumbs += 1;
}

for (let i = 0; i < tally.reencode.length; i += PARALLEL) {
  await Promise.all(
    tally.reencode.slice(i, i + PARALLEL).map((photo, j) => reencode(photo, i + j)),
  );
}
if (apply) {
  for (let i = 0; i < tally.thumbOnly.length; i += PARALLEL) {
    await Promise.all(tally.thumbOnly.slice(i, i + PARALLEL).map(addThumb));
  }
}

console.log(
  `\n  drawn again: ${kb(result.before)} → ${kb(result.after)} at full size` +
    (result.skipped ? `; ${result.skipped} not smaller, left alone` : '') +
    (result.failed ? `; ${result.failed} failed` : ''),
);
if (apply) {
  console.log(
    `  ✓ ${result.moved} moved to WebP, ${result.thumbs} thumbnails added` +
      (result.raced ? `, ${result.raced} left (changed meanwhile)` : ''),
  );
} else {
  console.log(`  ${tally.thumbOnly.length} thumbnails would be added (downloaded in --apply only)`);
}
process.exit(result.failed > 0 ? 1 : 0);
