/**
 * The notifications card (review), shown once: on the first screen after
 * joining or opening a pool, and on Home after a first sign-in with no
 * pools. A query flag carries it there and the card takes it off again, so
 * a reload or a later visit never brings it back.
 */
export const WELCOME = 'welcome';
export const WELCOME_HOME = `/?${WELCOME}=1`;

export function welcomePool(id: string): string {
  return `/pool/${id}?${WELCOME}=1`;
}
