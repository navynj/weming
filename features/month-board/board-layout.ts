import { z } from 'zod';

/**
 * A splash's layout on the calendar, set by hand (0025; review): only the
 * fields a person set. X is a share of the column's width, Y in line
 * heights, so one layout reads the same in Week, Month and on a phone.
 * The ranges are the database's (board_layout_valid); checked here too, so
 * a refused value never leaves the browser.
 */
// Wide on purpose (0044): sliders are the only control, so a person can
// push a part far — three columns across, twenty lines down.
const x = z.number().min(-3).max(3);
const y = z.number().min(-20).max(20);
const tilt = z.number().min(-45).max(45);

export const IconLayout = z
  // `hidden` (0055): off the board, as a photo's is (0044).
  .object({
    inline: z.boolean(),
    size: z.number().min(0.5).max(8),
    x,
    y,
    tilt,
    hidden: z.boolean(),
  })
  .partial()
  .strict();
export const LabelLayout = z
  .object({
    x,
    y,
    tilt,
    fontSize: z.number().int().min(10).max(18),
    // A share of the lane, like X: narrower than it, or across up to four (0027, 0050).
    width: z.number().min(0.3).max(4),
    // A filled label's fill (0027): white or ink. No fill is another kind of label, never a choice.
    style: z.enum(['white', 'ink']),
    hidden: z.boolean(),
  })
  .partial()
  .strict();
export const PhotoLayout = z
  // `hidden` (0044): off the board only; the card and the sheet keep it.
  .object({ size: z.number().min(0.2).max(2), x, y, tilt, hidden: z.boolean() })
  .partial()
  .strict();
/** A YouTube video in a ripple (0055): a photo's fields, keyed by its id. */
export const VideoLayout = PhotoLayout;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** The most parts a post's order holds (0055): every one it can have. */
export const ORDER_MAX = 40;
/** A part's key in the order: label, icon, wave, photo:<media path>, video:<id>. */
export const PartKey = z
  .string()
  .max(520)
  .regex(/^(label|icon|wave|photo:.+|video:[A-Za-z0-9_-]{11})$/);
export const WaveLayout = z
  .object({
    on: z.boolean(),
    amp: z.number().min(1).max(8),
    length: z.number().min(8).max(32),
    weight: z.number().min(1).max(4),
    span: z.number().min(0.2).max(4),
    x,
    y,
    tilt,
  })
  .partial()
  .strict();
/**
 * The whole piece (0038, Yoonji, in the session): label, icon, photos, wave
 * and slot moved together, and its layer — which pieces it sits over where
 * they meet, higher on top. Each part keeps its own offset on top of this.
 */
export const PieceLayout = z
  // Under 0 goes beneath the pieces left unset (0051): the layer buttons' back.
  .object({ x, y, layer: z.number().int().min(-20).max(20) })
  .partial()
  .strict();
export const BoardLayout = z
  .object({
    piece: PieceLayout,
    icon: IconLayout,
    label: LabelLayout,
    photos: z.record(z.string(), PhotoLayout).refine((p) => Object.keys(p).length <= 20),
    videos: z
      .record(z.string().regex(VIDEO_ID), VideoLayout)
      .refine((v) => Object.keys(v).length <= 20),
    wave: WaveLayout,
    // The post's parts back to front, each once (0055).
    order: z
      .array(PartKey)
      .max(ORDER_MAX)
      .refine((o) => new Set(o).size === o.length),
  })
  .partial()
  .strict();
export type BoardLayoutJson = z.infer<typeof BoardLayout>;

/** Where a splash's layout comes from on the screen it is drawn on. */
export type LayoutSource = 'pool' | 'home' | null;

type Group = 'piece' | 'icon' | 'label' | 'wave';

/**
 * The database's merge, mirrored (set_board_layout): icon, label and wave
 * field by field; photos per media path, then per field. So the screen
 * shows at once what the row will hold.
 */
export function mergeLayout(base: BoardLayoutJson, patch: BoardLayoutJson): BoardLayoutJson {
  const out: BoardLayoutJson = { ...base };
  for (const key of ['piece', 'icon', 'label', 'wave'] as const satisfies readonly Group[]) {
    if (patch[key]) (out as Record<Group, unknown>)[key] = { ...base[key], ...patch[key] };
  }
  if (patch.photos) {
    const photos = { ...base.photos };
    for (const [path, value] of Object.entries(patch.photos))
      photos[path] = { ...photos[path], ...value };
    out.photos = photos;
  }
  if (patch.videos) {
    const videos = { ...base.videos };
    for (const [id, value] of Object.entries(patch.videos))
      videos[id] = { ...videos[id], ...value };
    out.videos = videos;
  }
  // Replaced whole, never merged (0055).
  if (patch.order) out.order = patch.order;
  return out;
}

/** The database's dotted clears, mirrored: "wave", "icon.size", "photos.<path>", "photos.<path>.tilt". */
export function clearLayout(layout: BoardLayoutJson, paths: string[]): BoardLayoutJson {
  let out: BoardLayoutJson = structuredClone(layout);
  for (const path of paths) {
    const photo = /^photos\.(.+)\.(size|x|y|tilt|hidden)$/.exec(path);
    if (photo && out.photos?.[photo[1]]) {
      delete (out.photos[photo[1]] as Record<string, unknown>)[photo[2]];
    } else if (path.startsWith('photos.') && out.photos) {
      delete out.photos[path.slice(7)];
    } else if (path.startsWith('videos.') && out.videos) {
      // An id holds no dot: videos.<id> or videos.<id>.<field>.
      const [, id, field] = path.split('.');
      if (field && out.videos[id]) delete (out.videos[id] as Record<string, unknown>)[field];
      else if (!field) delete out.videos[id];
    } else if (path.includes('.')) {
      const [group, field] = path.split('.') as [Group, string];
      if (out[group]) delete (out[group] as Record<string, unknown>)[field];
    } else {
      out = { ...out };
      delete (out as Record<string, unknown>)[path];
    }
  }
  // A group left with nothing in it is gone, so only set fields remain.
  if (out.photos) {
    for (const [path, value] of Object.entries(out.photos)) {
      if (Object.keys(value).length === 0) delete out.photos[path];
    }
  }
  if (out.videos) {
    for (const [id, value] of Object.entries(out.videos)) {
      if (Object.keys(value).length === 0) delete out.videos[id];
    }
  }
  for (const key of Object.keys(out) as (keyof BoardLayoutJson)[]) {
    if (out[key] && Object.keys(out[key]!).length === 0) delete out[key];
  }
  return out;
}

/**
 * What a splash is drawn with (review): the automatic recipe, then the
 * pool's layout; on Home, while I have a Home layout, mine instead of the
 * pool's — wholly, so later pool edits do not reach my Home.
 */
export function effectiveLayout(
  home: BoardLayoutJson | null | undefined,
  pool: BoardLayoutJson | null | undefined,
): { layout: BoardLayoutJson; source: LayoutSource } {
  if (home) return { layout: home, source: 'home' };
  if (pool) return { layout: pool, source: 'pool' };
  return { layout: {}, source: null };
}

/**
 * Moved by hand (0044): any part, or the whole piece, set off its place. Such
 * a post may reach into its neighbours' cells, so it is drawn above them.
 */
export function handMoved(layout: BoardLayoutJson | undefined): boolean {
  if (!layout) return false;
  const off = (g: { x?: number; y?: number } | undefined): boolean => !!(g?.x || g?.y);
  return (
    off(layout.piece) ||
    off(layout.icon) ||
    off(layout.label) ||
    off(layout.wave) ||
    Object.values(layout.photos ?? {}).some(off)
  );
}

/**
 * A ranged post (review): a band along its days, whose one hand-set field
 * is its words' size; the panel and the board's handles both offer it alone.
 */
export function isPeriod(splash: { range: { start: string; end: string } | null }): boolean {
  return splash.range != null && splash.range.start < splash.range.end;
}

/** The icon or the label taken off the board (0055): the card and the page keep it. */
export function iconHidden(layout: BoardLayoutJson | undefined): boolean {
  return layout?.icon?.hidden === true;
}
export function labelHidden(layout: BoardLayoutJson | undefined): boolean {
  return layout?.label?.hidden === true;
}

/** The photos a card shows on the board: every one but those hidden from it (0044). */
export function boardPhotos<P extends { path: string }>(
  photos: P[] | undefined,
  layout: BoardLayoutJson | undefined,
): P[] {
  return (photos ?? []).filter((photo) => layout?.photos?.[photo.path]?.hidden !== true);
}

/** Photos keyed by a media path the splash no longer carries are ignored when drawing. */
export function photoLayout(layout: BoardLayoutJson | undefined, path: string) {
  return layout?.photos?.[path];
}
