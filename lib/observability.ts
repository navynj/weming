import type { BrowserOptions } from '@sentry/nextjs';

/** The events the SDK hands to beforeSend and beforeSendTransaction. */
type ErrorEvent = Parameters<NonNullable<BrowserOptions['beforeSend']>>[0];
type TransactionEvent = Parameters<NonNullable<BrowserOptions['beforeSendTransaction']>>[0];

/**
 * Error tracking (Sentry), shared by the browser, the server and the edge.
 *
 * Records are written for oneself (CLAUDE.md): nothing anyone wrote leaves
 * for Sentry. An event keeps the error's type, message and stack, the route,
 * an opaque user id and the release — nothing else. No request bodies, form
 * data, query strings, cookies or headers; no breadcrumbs; no Session Replay;
 * and any text that looks like a photo's path or a file's name is replaced
 * before it is sent.
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

/** The contexts Sentry keeps: the runtime and the trace, which hold no one's words. */
const KEPT_CONTEXTS = new Set(['os', 'browser', 'runtime', 'device', 'trace', 'app', 'culture']);
/** The tags kept: the operation that failed (captureFailure), and Sentry's own. */
const KEPT_TAGS = new Set(['op', 'runtime', 'transaction', 'url']);

/** Every event, before it leaves: the fields above and nothing more. */
export function scrubEvent<E extends ErrorEvent | TransactionEvent>(event: E): E {
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
  }
  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      if (!KEPT_TAGS.has(key)) delete event.tags[key];
    }
    if (typeof event.tags.url === 'string') event.tags.url = routeOf(event.tags.url) ?? '';
  }
  if (event.message) event.message = scrubText(event.message);
  if (event.transaction) event.transaction = routeOf(scrubText(event.transaction));
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      // A frame's local variables could hold anything a person wrote.
      delete frame.vars;
    }
  }
  for (const span of (event as TransactionEvent).spans ?? []) {
    if (span.description) span.description = routeOf(scrubText(span.description));
    span.data = {};
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
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeSendTransaction: (event: TransactionEvent) => scrubEvent(event),
  };
}
