/**
 * YouTube links in a ripple's words (part 5, review): each video becomes a
 * media item of the ripple, beside its photos; the link text stays where it
 * was written. Nothing here reaches YouTube: a thumbnail is fetched only
 * when drawn, and the player only once play is pressed.
 */

/** A video in a ripple: its id, where a link said to start, and whether it is a Short (9:16). */
export type YouTubeVideo = { id: string; start: number | null; short: boolean };

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

/** Every URL-looking run in the text: what a link is, before it is checked. */
const URLISH = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"')]+/gi;

/** "1h2m3s", "90s", "90": seconds. */
function seconds(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** One link to its video, or null: watch, youtu.be, shorts, embed and live, with or without a time. */
export function videoOf(link: string): YouTubeVideo | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  let short = false;
  if (host === 'youtu.be') id = path[0] ?? null;
  else if (HOSTS.has(host)) {
    if (path[0] === 'watch') id = url.searchParams.get('v');
    else if (path[0] === 'shorts') {
      id = path[1] ?? null;
      short = true;
    } else if (path[0] === 'embed' || path[0] === 'live' || path[0] === 'v') id = path[1] ?? null;
  }
  if (!id || !ID.test(id)) return null;
  const start = seconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { id, start, short };
}

/** Every video the text links to, in the order written, each once. */
export function videosIn(text: string | null | undefined): YouTubeVideo[] {
  if (!text) return [];
  const out: YouTubeVideo[] = [];
  for (const match of text.matchAll(URLISH)) {
    const video = videoOf(match[0]);
    if (video && !out.some((v) => v.id === video.id)) out.push(video);
  }
  return out;
}

/** Its thumbnail: fetched only where it is drawn. */
export function thumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** The player, from youtube-nocookie.com: loaded only once play is pressed. */
export function playerUrl(video: YouTubeVideo): string {
  const query = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
  if (video.start) query.set('start', String(video.start));
  return `https://www.youtube-nocookie.com/embed/${video.id}?${query}`;
}

/** Its box's shape: a Short stands 9:16, every other video 16:9. */
export function videoAspect(video: Pick<YouTubeVideo, 'short'>): number {
  return video.short ? 9 / 16 : 16 / 9;
}
