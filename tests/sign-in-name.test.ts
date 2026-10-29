import { describe, expect, it } from 'vitest';

import { signInName } from '@/features/auth/sign-in-name';

/** The name a first sign-in starts with (H60): never a blank one. */
describe('the name from signing in', () => {
  it('is Google’s full name when it has one', () => {
    expect(signInName({ full_name: ' Sora Kim ', name: 'Sora' }, 'sora@x.com')).toBe('Sora Kim');
  });

  it('passes over a blank name to the next', () => {
    expect(signInName({ full_name: '', name: '  ' }, 'sora.k@x.com')).toBe('sora.k');
    expect(signInName({ full_name: '   ', name: 'Sora' }, undefined)).toBe('Sora');
  });

  it('fits the 40 characters a name may have', () => {
    expect(signInName({ full_name: 'a'.repeat(60) }, undefined)).toHaveLength(40);
  });

  it('is empty only when nothing has a letter, for the join screen to ask', () => {
    expect(signInName({}, undefined)).toBe('');
    expect(signInName({ full_name: 42 }, '@x.com')).toBe('');
  });
});
