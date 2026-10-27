import { describe, expect, it } from 'vitest';

import { linkedCount, settleMarkers, siblings, type Markers } from '@/features/pool/match';

const OFF = { isDefault: false, shareByDefault: false, isHome: false };

describe('linkedCount', () => {
  it('counts connected rows only', () => {
    expect(linkedCount({ a: 'x', b: null, c: 'y' })).toBe(2);
    expect(linkedCount({ a: null })).toBe(0);
    expect(linkedCount({})).toBe(0);
  });
});

describe('siblings (0033)', () => {
  it('lists every row connecting the same lane of mine, itself among them', () => {
    const links = { a: 'church', b: 'day', c: 'church', d: null };
    const keys = ['a', 'b', 'c', 'd'];
    expect(siblings('a', keys, links)).toEqual(['a', 'c']);
    expect(siblings('b', keys, links)).toEqual(['b']);
    expect(siblings('d', keys, links)).toEqual([]);
  });
});

describe('settleMarkers (0033)', () => {
  const keys = ['a', 'b', 'c'];

  it('makes the first row a lane of mine connects its default, sharing nothing', () => {
    expect(settleMarkers(keys, { a: 'church', b: 'church', c: 'day' }, {})).toEqual({
      a: { ...OFF, isDefault: true },
      b: OFF,
      c: { ...OFF, isDefault: true },
    });
  });

  it('keeps the row marked default, and only one per lane of mine', () => {
    const markers: Markers = {
      b: { isDefault: true, shareByDefault: true, isHome: false },
      c: { isDefault: true, shareByDefault: false, isHome: false },
    };
    const settled = settleMarkers(keys, { a: 'church', b: 'church', c: 'church' }, markers);
    expect(settled.a.isDefault).toBe(false);
    expect(settled.b).toEqual({ isDefault: true, shareByDefault: true, isHome: false });
    expect(settled.c.isDefault).toBe(false);
  });

  it('lets only the default row share by default', () => {
    const markers: Markers = {
      a: { isDefault: true, shareByDefault: false, isHome: false },
      b: { isDefault: false, shareByDefault: true, isHome: false },
    };
    const settled = settleMarkers(keys, { a: 'church', b: 'church', c: null }, markers);
    expect(settled.a.shareByDefault).toBe(false);
    expect(settled.b.shareByDefault).toBe(false);
  });

  it('keeps Home per row, on any connected row', () => {
    const markers: Markers = {
      a: { ...OFF, isHome: true },
      b: { ...OFF, isHome: true },
    };
    const settled = settleMarkers(keys, { a: 'church', b: 'church', c: 'day' }, markers);
    expect(settled.a.isHome).toBe(true);
    expect(settled.b.isHome).toBe(true);
    expect(settled.c.isHome).toBe(false);
  });

  it('leaves unconnected rows out, whatever they were marked', () => {
    const markers: Markers = { b: { isDefault: true, shareByDefault: true, isHome: true } };
    const settled = settleMarkers(keys, { a: 'church', b: null }, markers);
    expect(Object.keys(settled)).toEqual(['a']);
    expect(settled.a).toEqual({ ...OFF, isDefault: true });
  });
});
