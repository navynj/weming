// What an image file carries besides its pixels, and the same file without it.
//
// For scripts/scrub-image-metadata.mjs (2026-10-28): photos uploaded before
// the browser redrew every one (lib/compress-image.ts) could reach storage
// with their EXIF, the location among it. Stripping happens at the container
// level — JPEG segments, PNG chunks, WebP chunks — so the pixels are copied
// byte for byte and never re-encoded: no quality is lost and the size does
// not change. A photo whose orientation is not the default keeps that one
// tag in an EXIF block of its own, so it still shows upright; everything else
// (GPS, camera, times, XMP, IPTC, comments, text) goes.
//
// Pure functions over Uint8Array; nothing here reads a file or prints.
import { crc32 } from 'node:zlib';

const ascii = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
const startsWith = (bytes, at, text) => ascii(bytes, at, text.length) === text;
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const readBe32 = (b, at) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const readLe32 = (b, at) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;

/** The file's format by its first bytes; never by its name or stored type. */
export function formatOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (startsWith(bytes, 0, '\x89PNG\r\n\x1a\n')) return 'png';
  if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WEBP')) return 'webp';
  if (startsWith(bytes, 0, 'GIF8')) return 'gif';
  if (startsWith(bytes, 4, 'ftyp')) return 'isobmff'; // AVIF, HEIC
  return 'unknown';
}

/** A TIFF block's orientation and whether it points at GPS data. */
export function readTiff(tiff) {
  const result = { orientation: null, gps: false };
  if (tiff.length < 8) return result;
  const little = startsWith(tiff, 0, 'II');
  const u16 = (at) => (little ? tiff[at] | (tiff[at + 1] << 8) : (tiff[at] << 8) | tiff[at + 1]);
  const u32 = (at) => (little ? readLe32(tiff, at) : readBe32(tiff, at));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return result;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    const tag = u16(entry);
    if (tag === 0x0112) result.orientation = u16(entry + 8);
    if (tag === 0x8825) result.gps = true;
  }
  return result;
}

/** An EXIF TIFF block holding the orientation and nothing else. */
export function orientationOnlyTiff(orientation) {
  return new Uint8Array([
    ...[0x4d, 0x4d, 0x00, 0x2a],
    ...be32(8),
    ...be16(1),
    ...[...be16(0x0112), ...be16(3), ...be32(1), ...be16(orientation), 0, 0],
    ...be32(0),
  ]);
}

const xmpHasGps = (text) => /GPS(Latitude|Longitude|Altitude)/.test(text);
const keptOrientation = (o) => (o && o !== 1 ? o : null);

// --- JPEG -----------------------------------------------------------------

const EXIF_ID = 'Exif\0\0';
const XMP_IDS = ['http://ns.adobe.com/xap/1.0/\0', 'http://ns.adobe.com/xmp/extension/\0'];

/** Segments before the scan, the scan through EOI, and anything after it. */
function jpegParts(bytes) {
  const segments = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (marker === 0xda) {
      // The scan runs to the first EOI: FF D9 cannot occur inside entropy-
      // coded data (FF is stuffed), and markers between progressive scans
      // are never D9.
      let end = at;
      while (end + 1 < bytes.length && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) end += 1;
      return { segments, scan: bytes.subarray(at, end + 2), trailing: bytes.length - (end + 2) };
    }
    segments.push({
      marker,
      data: bytes.subarray(at + 4, at + 2 + length),
      raw: bytes.subarray(at, at + 2 + length),
    });
    at += 2 + length;
  }
  return null;
}

function jpegMeta(segment) {
  const { marker, data } = segment;
  if (marker === 0xe1 && startsWith(data, 0, EXIF_ID))
    return { kind: 'exif', tiff: data.subarray(6) };
  if (marker === 0xe1 && XMP_IDS.some((id) => startsWith(data, 0, id))) return { kind: 'xmp' };
  if (marker === 0xe2 && startsWith(data, 0, 'MPF\0')) return { kind: 'mpf' };
  if (marker === 0xe2 && startsWith(data, 0, 'ICC_PROFILE\0')) return null; // colour, kept
  if (marker === 0xe0 || marker === 0xee) return null; // JFIF, Adobe: decoding needs them
  if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return { kind: 'other' };
  return null;
}

// --- PNG ------------------------------------------------------------------

const PNG_META = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function pngChunks(bytes) {
  const chunks = [];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = readBe32(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    chunks.push({
      type,
      data: bytes.subarray(at + 8, at + 8 + length),
      raw: bytes.subarray(at, at + 12 + length),
    });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngChunk(type, data) {
  const body = concat([new Uint8Array([...type].map((c) => c.charCodeAt(0))), data]);
  return concat([new Uint8Array(be32(data.length)), body, new Uint8Array(be32(crc32(body)))]);
}

// --- WebP -----------------------------------------------------------------

function webpChunks(bytes) {
  const chunks = [];
  let at = 12;
  while (at + 8 <= bytes.length) {
    const fourcc = ascii(bytes, at, 4);
    const size = readLe32(bytes, at + 4);
    const padded = size + (size & 1);
    chunks.push({
      fourcc,
      data: bytes.subarray(at + 8, at + 8 + size),
      raw: bytes.subarray(at, at + 8 + padded),
    });
    at += 8 + padded;
  }
  return chunks;
}

function webpChunk(fourcc, data) {
  const pad = data.length & 1 ? new Uint8Array([0]) : new Uint8Array(0);
  return concat([
    new Uint8Array([...[...fourcc].map((c) => c.charCodeAt(0)), ...le32(data.length)]),
    data,
    pad,
  ]);
}

// --- the two questions ----------------------------------------------------

/**
 * What the file carries besides pixels. `metadata` is true when stripping
 * would change it; `gps` when a location is among it. A format this cannot
 * rewrite is `supported: false` and counted, never touched.
 */
export function inspect(bytes) {
  const format = formatOf(bytes);
  const out = { format, supported: true, metadata: false, gps: false, orientation: null };
  if (format === 'jpeg') {
    const parts = jpegParts(bytes);
    if (!parts) return { ...out, supported: false };
    for (const segment of parts.segments) {
      const meta = jpegMeta(segment);
      if (!meta) continue;
      out.metadata = true;
      if (meta.kind === 'exif') {
        const tiff = readTiff(meta.tiff);
        out.gps ||= tiff.gps;
        out.orientation = tiff.orientation;
      }
      if (meta.kind === 'xmp') out.gps ||= xmpHasGps(ascii(segment.data, 0, segment.data.length));
    }
    if (parts.trailing > 0) out.metadata = true;
    // A lone orientation block (what stripping leaves) is not metadata to strip.
    if (out.metadata && isOrientationOnlyJpeg(parts)) out.metadata = false;
    return out;
  }
  if (format === 'png') {
    for (const chunk of pngChunks(bytes)) {
      if (!PNG_META.has(chunk.type)) continue;
      if (chunk.type === 'eXIf') {
        const tiff = readTiff(chunk.data);
        out.gps ||= tiff.gps;
        out.orientation = tiff.orientation;
        if (isOrientationOnly(chunk.data)) continue;
      }
      if (chunk.type === 'iTXt') out.gps ||= xmpHasGps(ascii(chunk.data, 0, chunk.data.length));
      out.metadata = true;
    }
    return out;
  }
  if (format === 'webp') {
    for (const chunk of webpChunks(bytes)) {
      if (chunk.fourcc === 'EXIF') {
        const tiff = readTiff(
          startsWith(chunk.data, 0, EXIF_ID) ? chunk.data.subarray(6) : chunk.data,
        );
        out.gps ||= tiff.gps;
        out.orientation = tiff.orientation;
        if (!isOrientationOnly(chunk.data)) out.metadata = true;
      }
      if (chunk.fourcc === 'XMP ') {
        out.metadata = true;
        out.gps ||= xmpHasGps(ascii(chunk.data, 0, chunk.data.length));
      }
    }
    return out;
  }
  if (format === 'gif') {
    // GIF has no EXIF; an XMP application block is the one place for it.
    const text = ascii(bytes, 0, bytes.length);
    return {
      ...out,
      supported: false,
      metadata: text.includes('XMP DataXMP'),
      gps: xmpHasGps(text),
    };
  }
  return { ...out, supported: false };
}

function isOrientationOnly(tiff) {
  const body = startsWith(tiff, 0, EXIF_ID) ? tiff.subarray(6) : tiff;
  const { orientation } = readTiff(body);
  if (!orientation) return false;
  const minimal = orientationOnlyTiff(orientation);
  return body.length === minimal.length && body.every((b, i) => b === minimal[i]);
}

function isOrientationOnlyJpeg(parts) {
  if (parts.trailing > 0) return false;
  const metas = parts.segments.map(jpegMeta).filter(Boolean);
  return metas.length === 1 && metas[0].kind === 'exif' && isOrientationOnly(metas[0].tiff);
}

/** The same file without its metadata, pixels untouched; null when it cannot be rewritten. */
export function strip(bytes) {
  const found = inspect(bytes);
  if (!found.supported) return null;
  if (!found.metadata) return bytes;
  const orientation = keptOrientation(found.orientation);

  if (found.format === 'jpeg') {
    const parts = jpegParts(bytes);
    const kept = [];
    let placed = false;
    for (const segment of parts.segments) {
      if (jpegMeta(segment)) continue;
      kept.push(segment.raw);
      // The orientation goes right after JFIF/at the head, where readers look.
      if (!placed && orientation && segment.marker === 0xe0) {
        kept.push(jpegOrientation(orientation));
        placed = true;
      }
    }
    if (!placed && orientation) kept.unshift(jpegOrientation(orientation));
    return concat([bytes.subarray(0, 2), ...kept, parts.scan]);
  }

  if (found.format === 'png') {
    const parts = [bytes.subarray(0, 8)];
    let placed = false;
    for (const chunk of pngChunks(bytes)) {
      if (PNG_META.has(chunk.type)) continue;
      // eXIf must come before the first image data.
      if (chunk.type === 'IDAT' && orientation && !placed) {
        parts.push(pngChunk('eXIf', orientationOnlyTiff(orientation)));
        placed = true;
      }
      parts.push(chunk.raw);
    }
    return concat(parts);
  }

  // WebP
  const kept = [];
  for (const chunk of webpChunks(bytes)) {
    if (chunk.fourcc === 'XMP ') continue;
    if (chunk.fourcc === 'EXIF') {
      if (orientation) kept.push(webpChunk('EXIF', orientationOnlyTiff(orientation)));
      continue;
    }
    if (chunk.fourcc === 'VP8X') {
      const data = new Uint8Array(chunk.data);
      data[0] &= ~0x04; // XMP
      if (!orientation) data[0] &= ~0x08; // EXIF
      kept.push(webpChunk('VP8X', data));
      continue;
    }
    kept.push(chunk.raw);
  }
  const body = concat([new Uint8Array([0x57, 0x45, 0x42, 0x50]), ...kept]); // "WEBP"
  return concat([new Uint8Array([0x52, 0x49, 0x46, 0x46, ...le32(body.length)]), body]);
}

function jpegOrientation(orientation) {
  const payload = concat([
    new Uint8Array([...EXIF_ID].map((c) => c.charCodeAt(0))),
    orientationOnlyTiff(orientation),
  ]);
  return concat([new Uint8Array([0xff, 0xe1, ...be16(payload.length + 2)]), payload]);
}
