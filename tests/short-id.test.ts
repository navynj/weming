import { describe, expect, it } from 'vitest';

import { fromShortId, isShortId, isUuid, toShortId } from '@/lib/short-id';

const UUID = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

describe('short ids (H62)', () => {
  it('round-trips a uuid through 22 base58 characters', () => {
    const short = toShortId(UUID);
    expect(short).toHaveLength(22);
    expect(isShortId(short)).toBe(true);
    expect(fromShortId(short)).toBe(UUID);
  });

  it('round-trips random uuids, every one exactly 22 characters', () => {
    for (let i = 0; i < 500; i += 1) {
      const uuid = crypto.randomUUID();
      const short = toShortId(uuid);
      expect(short).toHaveLength(22);
      expect(fromShortId(short)).toBe(uuid);
    }
  });

  it('pads the ends of the range to the same width', () => {
    expect(toShortId('00000000-0000-0000-0000-000000000000')).toBe('1'.repeat(22));
    const max = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    expect(fromShortId(toShortId(max))).toBe(max);
  });

  it('reads an uppercase uuid as the same id, and decodes to lowercase', () => {
    const upper = UUID.toUpperCase();
    expect(isUuid(upper)).toBe(true);
    expect(toShortId(upper)).toBe(toShortId(UUID));
    expect(fromShortId(toShortId(upper))).toBe(UUID);
  });

  it('refuses what is not a uuid', () => {
    for (const bad of [
      '',
      'nope',
      UUID.slice(1),
      `${UUID}0`,
      UUID.replace(/-/g, ''),
      'g'.repeat(36),
    ]) {
      expect(() => toShortId(bad)).toThrow();
    }
  });

  it('returns null for what is not a short id', () => {
    for (const bad of [
      '',
      'nope',
      '1'.repeat(21),
      '1'.repeat(23),
      // Outside the alphabet: 0, O, I and l.
      `0${'1'.repeat(21)}`,
      `O${'1'.repeat(21)}`,
      `I${'1'.repeat(21)}`,
      `l${'1'.repeat(21)}`,
      // The right shape, past 2^128.
      'z'.repeat(22),
      UUID,
    ]) {
      expect(fromShortId(bad)).toBeNull();
    }
  });
});
