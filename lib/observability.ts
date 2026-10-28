import type { BrowserOptions, getClient } from '@sentry/nextjs';

/** What the SDK hands to beforeSend and beforeSendSpan. */
type ErrorEvent = Parameters<NonNullable<BrowserOptions['beforeSend']>>[0];
type StreamedSpan = Parameters<NonNullable<BrowserOptions['beforeSendSpan']>>[0];
type Client = ReturnType<typeof getClient>;

/**
 * Error tracking (Sentry), shared by the browser, the server and the edge.
 *
 * Records are written for oneself (CLAUDE.md): nothing anyone wrote leaves
 * for Sentry. An event keeps the error's type, message and stack, the route,
 * an opaque user id (the Supabase id, set in lib/sentry-user.ts) and the
 * release — nothing else. No request bodies, form
 * data, query strings, cookies or headers; no breadcrumbs; no Session Replay;
 * and any text that looks like a photo's path or a file's name is replaced
 * before it is sent.
 *
 * Traces are streamed spans (the SDK's default trace lifecycle, where
 * beforeSendTransaction never runs): each span keeps its name as a route
 * pattern (/splash/[id]), its timing, status, method and status code, and
 * nothing else.
 */

/** Where events go. Public by design: it can only send, never read. */
export const SENTRY_DSN =
  'https://21978615dd80a84069b2ece1fde68d63@o4512327756414976.ingest.us.sentry.io/4512327781974016';

/** Production, a preview, or a local run (which sends nothing). */
export function sentryEnvironment(vercelEnv: string | undefined): string {
  return vercelEnv === 'production' || vercelEnv === 'preview' ? vercelEnv : 'development';
}

/** Errors always; traces a tenth of the time in production, never in a preview. */
export function tracesRate(environment: string): number {
  return environment === 'production' ? 0.1 : 0;
}

// A storage path is "<user uuid>/<anything>"; a file name ends in an image extension.
const PATH = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\s"')]+/gi;
const FILE = /[^\s"'/\\()[\]]+\.(?:jpe?g|png|gif|webp|heic|heif|avif|svg|mov|mp4)\b/gi;

/** A message with any photo path or file name taken out. */
export function scrubText(text: string): string {
  return text.replace(PATH, '<path>').replace(FILE, '<file>');
}

/** A route without its query string: the path alone says where. */
function routeOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url.split('?')[0];
  }
}

// The app's dynamic segments (app/), each put back to its pattern. `new` and
// `settings` are pages, not ids. An invite token is a key, not just an id.
const SEGMENTS: [RegExp, string][] = [
  [/\/join\/[^/?#\s]+/g, '/join/[token]'],
  [/\/pool\/(?!new\b|\[)[^/?#\s]+/g, '/pool/[id]'],
  [/\/splash\/(?!\[)[^/?#\s]+/g, '/splash/[id]'],
  [/\/lane\/(?!\[)[^/?#\s]+/g, '/lane/[id]'],
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A span's name or URL as a route pattern: no origin, no query string, no
 * record, pool, lane or invite id, no photo path or file name. A nested pool
 * splash reads /pool/[id]/splash/[id], one name for both of its params.
 */
export function scrubName(text: string): string {
  // "GET https://host/splash/42?x=1" keeps its method and loses the rest.
  let out = text.replace(/[a-z][a-z0-9+.-]*:\/\/[^/\s]*/gi, '').replace(/\?[^\s]*/g, '');
  // Routes first: a "<uuid>/splash" inside a route is not a storage path.
  for (const [pattern, route] of SEGMENTS) out = out.replace(pattern, route);
  return scrubText(out).replace(UUID, '[id]');
}

/** Span attributes kept as they are: the SDK's own bookkeeping and the request's shape. */
const KEPT_ATTRIBUTES = new Set([
  'sentry.op',
  'sentry.origin',
  'sentry.source',
  'sentry.span.source',
  'sentry.segment.id',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.sdk.integrations',
  'sentry.release',
  'sentry.environment',
  'sentry.trace.lifecycle',
  'sentry.sample_rate',
  'sentry.idle_span_finish_reason',
  'sentry.profile_id',
  'sentry.profiler_id',
  'http.request.method',
  'http.method',
  'http.response.status_code',
  'http.status_code',
  'culture.locale',
  'culture.timezone',
  // Opaque, as on errors; email, name and address are never kept.
  'user.id',
]);
/** Attributes that carry a route or URL: kept, but only as its pattern. */
const ROUTE_ATTRIBUTES = new Set([
  'sentry.segment.name',
  'http.route',
  'next.route',
  'url.template',
  'url.path',
  'url.full',
  'http.url',
  'http.target',
]);

type SpanAttributes = Record<string, unknown>;

/**
 * Attributes reduced to what is known to hold no one's words: an allowlist,
 * not a denylist, so a new SDK attribute (a body, a header, a db row, an
 * image's URL) is dropped until someone decides it is safe. Numbers and
 * booleans (durations, web vitals, sizes) cannot hold text and stay.
 */
export function scrubAttributes(attributes: SpanAttributes | undefined): SpanAttributes {
  const kept: SpanAttributes = {};
  for (const [key, raw] of Object.entries(attributes ?? {})) {
    // A raw value, or the typed { value, unit } form.
    const value =
      raw !== null && typeof raw === 'object' && 'value' in raw
        ? (raw as { value: unknown }).value
        : raw;
    if (ROUTE_ATTRIBUTES.has(key)) {
      if (typeof value === 'string') kept[key] = scrubName(value);
    } else if (
      KEPT_ATTRIBUTES.has(key) ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      kept[key] = raw;
    }
  }
  return kept;
}

/** Every span, before it leaves (beforeSendSpan): a pattern for a name, the attributes above. */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = scrubName(span.name);
  span.attributes = scrubAttributes(span.attributes) as StreamedSpan['attributes'];
  for (const link of span.links ?? []) link.attributes = {};
  return span;
}

/** The contexts Sentry keeps: the runtime and the trace, which hold no one's words. */
const KEPT_CONTEXTS = new Set(['os', 'browser', 'runtime', 'device', 'trace', 'app', 'culture']);
/** The tags kept: the operation that failed (captureFailure), and Sentry's own. */
const KEPT_TAGS = new Set(['op', 'runtime', 'transaction', 'url']);

/** Every error event, before it leaves: the fields above and nothing more. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: routeOf(event.request.url),
    };
  }
  // An opaque id only: no email, no name, no address.
  event.user = event.user?.id ? { id: String(event.user.id) } : undefined;
  delete event.extra;
  delete event.breadcrumbs;
  delete event.server_name;
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (!KEPT_CONTEXTS.has(key)) delete event.contexts[key];
    }
    // The active span's attributes ride along on an error, as on a span.
    const trace = event.contexts.trace;
    if (trace?.data) trace.data = scrubAttributes(trace.data);
  }
  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      if (!KEPT_TAGS.has(key)) delete event.tags[key];
    }
    if (typeof event.tags.url === 'string') event.tags.url = routeOf(event.tags.url) ?? '';
  }
  if (event.message) event.message = scrubText(event.message);
  if (event.transaction) event.transaction = scrubName(event.transaction);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      // A frame's local variables could hold anything a person wrote.
      delete frame.vars;
    }
  }
  return event;
}

/** What every runtime's init shares. */
export function sentryOptions(vercelEnv: string | undefined, release: string | undefined) {
  const environment = sentryEnvironment(vercelEnv);
  return {
    dsn: SENTRY_DSN,
    environment,
    release: release || undefined,
    // A local run sends nothing.
    enabled: environment !== 'development',
    sendDefaultPii: false,
    sampleRate: 1,
    tracesSampleRate: tracesRate(environment),
    // Breadcrumbs carry console lines and fetched URLs: none are kept.
    beforeBreadcrumb: () => null,
    // The collectors off at the source, so the hooks below are the second
    // guard, not the only one.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
    },
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    // Spans stream (the default lifecycle): beforeSendTransaction and
    // ignoreTransactions would never run, so neither is set.
    beforeSendSpan: scrubSpan,
  };
}

/**
 * The trace's name also travels outside any span: in each envelope's trace
 * header and the baggage header on outgoing requests, where beforeSendSpan
 * does not reach. Call once after Sentry.init, in every runtime.
 */
export function scrubTraceHeader(client: Client | undefined): void {
  client?.on('createDsc', (dsc) => {
    if (dsc.transaction) dsc.transaction = scrubName(dsc.transaction);
  });
}
