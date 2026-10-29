import { notFound } from 'next/navigation';

import { CompressProbe } from './compress-probe';

export const metadata = { title: 'Compress · fixture' };

/**
 * `compressImage` in a real browser, for e2e/photo-compress.spec.ts: the
 * canvas, the decoder and the encoder are the browser's, so only a browser
 * can say what a photo becomes. Dev-only; reads and writes no data.
 */
export default function CompressFixturePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <CompressProbe />;
}
