import { describe, expect, it } from 'vitest';

import {
  annotationLabel,
  annotationVerdict,
  draftFrom,
  spanIsEmpty,
  emptyDraft,
  laneRule,
  resolveCategory,
  residualCategory,
  type Annotation,
} from '@/features/input-sheet/draft';
import type { MyCategory } from '@/lib/queries/profile';

const TODAY = '2026-09-25';

function category(over: Partial<MyCategory> = {}): MyCategory {
  return {
    id: 'c-place',
    user_id: 'u1',
    name: 'Place',
    icon: '📍',
    default_mode: 'drop',
    position: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const LANES = [
  category(),
  category({ id: 'c-mood', name: 'Mood', position: 1 }),
  category({ id: 'c-day', name: 'Day', position: 5 }),
];

describe('the draft on first paint', () => {
  it('is a plain posted fragment: no lane, no annotation, no board', () => {
    const d = emptyDraft({});

    expect(d.categoryId).toBeNull();
    expect(d.annotation).toBeNull();
    expect(d.splashId).toBeNull();
    expect(d.note).toBe('');
  });

  it('takes a prefill from whichever entry point opened it', () => {
    expect(emptyDraft({ categoryId: 'c-mood' }).categoryId).toBe('c-mood');
    expect(emptyDraft({ splashId: 's1' }).splashId).toBe('s1');
  });
});

describe('no lane means the residual lane (H20i)', () => {
  it('falls into Day', () => {
    expect(residualCategory(LANES)?.id).toBe('c-day');
    expect(resolveCategory(null, { kind: 'free' }, LANES)).toBe('c-day');
  });

  it('keeps a chosen lane when the board says nothing', () => {
    expect(resolveCategory('c-mood', { kind: 'free' }, LANES)).toBe('c-mood');
  });
});

describe('a declared lane is a default, never an override (H21f)', () => {
  it('takes the declared lane when nothing is chosen', () => {
    const rule = laneRule({ declaredLaneId: 'c-place' });
    expect(rule).toEqual({ kind: 'default', categoryId: 'c-place' });
    expect(resolveCategory(null, rule, LANES)).toBe('c-place');
  });

  it('keeps a chosen lane over the declared one: accumulation, not rejection', () => {
    const rule = laneRule({ declaredLaneId: 'c-place' });
    expect(resolveCategory('c-mood', rule, LANES)).toBe('c-mood');
  });

  it('no declared lane leaves the choice free, the residual lane behind it', () => {
    expect(laneRule({ declaredLaneId: null })).toEqual({ kind: 'free' });
    expect(laneRule(null)).toEqual({ kind: 'free' });
    expect(resolveCategory(null, { kind: 'free' }, LANES)).toBe('c-day');
  });
});

describe('the annotation chip (H20c)', () => {
  const on = (over: Partial<Annotation>): Annotation => ({
    date: TODAY,
    time: null,
    endDate: null,
    endTime: null,
    ...over,
  });

  it('reads as a bare time today', () => {
    expect(annotationLabel(on({ time: '14:30' }), TODAY)).toBe('14:30');
  });

  it('reads as a date on another day, with the time when there is one', () => {
    expect(annotationLabel(on({ date: '2026-08-17' }), TODAY)).toBe('8. 17');
    expect(annotationLabel(on({ date: '2026-08-17', time: '14:30' }), TODAY)).toBe('8. 17 14:30');
  });

  it('reads a span across days as two dates', () => {
    expect(
      annotationLabel(
        on({ date: '2026-08-17', time: '20:00', endDate: '2026-08-18', endTime: '02:00' }),
        TODAY,
      ),
    ).toBe('8. 17 ~ 8. 18');
  });

  it('reads a span inside today as two times', () => {
    expect(annotationLabel(on({ time: '19:00', endDate: TODAY, endTime: '21:00' }), TODAY)).toBe(
      '19:00 ~ 21:00',
    );
  });

  it('reads a span by dates alone as two dates, and a same-day one as its start', () => {
    expect(annotationLabel(on({ date: '2026-08-17', endDate: '2026-08-20' }), TODAY)).toBe(
      '8. 17 ~ 8. 20',
    );
    expect(annotationLabel(on({ date: '2026-08-17', endDate: '2026-08-17' }), TODAY)).toBe('8. 17');
    expect(spanIsEmpty(on({ date: '2026-08-17', endDate: '2026-08-17' }))).toBe(true);
    expect(spanIsEmpty(on({ date: '2026-08-17', endDate: '2026-08-20' }))).toBe(false);
    expect(spanIsEmpty(on({ time: '19:00', endDate: TODAY, endTime: '21:00' }))).toBe(false);
  });

  it('validates a span by dates alone as end day after start day', () => {
    expect(annotationVerdict(on({ date: '2026-08-17', endDate: '2026-08-20' }))).toBe('ok');
    expect(annotationVerdict(on({ date: '2026-08-17', endDate: '2026-08-17' }))).toBe('ok');
    expect(annotationVerdict(on({ date: '2026-08-17', endDate: '2026-08-16' }))).toBe('backwards');
    // A clock at the start with an end date and no end clock: same clock, later day.
    expect(annotationVerdict(on({ time: '19:00', endDate: '2026-09-26' }))).toBe('ok');
    expect(annotationVerdict(on({ time: '19:00', endDate: TODAY }))).toBe('backwards');
  });

  it('validates end > start, and nothing else', () => {
    expect(annotationVerdict(on({ time: '19:00', endDate: TODAY, endTime: '21:00' }))).toBe('ok');
    expect(annotationVerdict(on({ time: '19:00', endDate: TODAY, endTime: '18:00' }))).toBe(
      'backwards',
    );
    expect(annotationVerdict(on({ time: '19:00', endDate: TODAY, endTime: '19:00' }))).toBe(
      'backwards',
    );
    // A span into tomorrow is fine; the present is no longer policed (H18 dormant).
    expect(annotationVerdict(on({ time: '23:00', endDate: '2026-09-26', endTime: '01:00' }))).toBe(
      'ok',
    );
    expect(annotationVerdict(on({}))).toBe('ok');
  });
});

describe('the draft that edits a record', () => {
  const base = {
    note: 'peak chair',
    media: [] as string[],
    occurred_on: null as string | null,
    occurred_time: null as string | null,
    ended_at: null as string | null,
    started_at: null as string | null,
    splash_id: 's1' as string | null,
  };

  it('reads a plain fragment as unannotated', () => {
    expect(draftFrom(base, 'America/Vancouver').annotation).toBeNull();
  });

  it('reads a span back in the author zone', () => {
    const d = draftFrom(
      {
        ...base,
        occurred_on: '2026-09-24',
        occurred_time: '19:00:00',
        started_at: '2026-09-25T02:00:00.000Z',
        ended_at: '2026-09-25T04:00:00.000Z',
      },
      'America/Vancouver',
    );
    expect(d.annotation).toEqual({
      date: '2026-09-24',
      time: '19:00',
      endDate: '2026-09-24',
      endTime: '21:00',
    });
    expect(d.splashId).toBe('s1');
  });

  it('reads a span by dates alone back as dates with no clock', () => {
    // The close of Aug 20 in Vancouver, stored as the instant it is.
    const d = draftFrom(
      {
        ...base,
        occurred_on: '2026-08-17',
        occurred_time: null,
        started_at: null,
        ended_at: '2026-08-21T06:59:00.000Z',
      },
      'America/Vancouver',
    );
    expect(d.annotation).toEqual({
      date: '2026-08-17',
      time: null,
      endDate: '2026-08-20',
      endTime: null,
    });
  });
});
