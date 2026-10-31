'use client';

import { compressImage } from '@/lib/compress-image';

/** What the spec reads back: each copy's bytes, type and size, or the refusal. */
type Probed =
  | { refused: string }
  | {
      full: { type: string; w: number; h: number; bytes: number[] };
      display: { type: string; w: number; h: number; bytes: number[] } | null;
      thumb: { type: string; w: number; h: number; bytes: number[] } | null;
    };

declare global {
  interface Window {
    __compress?: (file: File) => Promise<Probed>;
  }
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())];
}

async function probe(file: File): Promise<Probed> {
  const out = await compressImage(file);
  if ('refused' in out) return out;
  return {
    full: { type: out.full.blob.type, ...out.full.size, bytes: await bytesOf(out.full.blob) },
    display: out.display
      ? { type: out.display.blob.type, ...out.display.size, bytes: await bytesOf(out.display.blob) }
      : null,
    thumb: out.thumb
      ? { type: out.thumb.blob.type, ...out.thumb.size, bytes: await bytesOf(out.thumb.blob) }
      : null,
  };
}

// Handed to the page as soon as this module runs in the browser; the spec
// waits for it.
if (typeof window !== 'undefined') window.__compress = probe;

export function CompressProbe() {
  return <p>compressImage fixture</p>;
}
