-- 0031: a ripple may carry its own day inside its splash's range (2026-10-26).
--
-- H24 holds for the lane, always: a ripple takes its splash's. Dates are
-- allowed back in one place (Yoonji, in the session): a ripple may carry its
-- own day (occurred_on) only when its splash has an end date, and only
-- within [declared_start, declared_end]. A splash without an end date takes
-- no dated ripple, as under 0029. No time, no duration: occurred_time,
-- ended_at, started_at and parent_ripple_id stay frozen as 0029 left them.
--
-- An existing date on a ripple of a range splash becomes editable under
-- these rules; on a splash with no end date it stays frozen, as written.
--
-- A splash's range may not shrink past a dated ripple: "Some entries are
-- dated outside this range." Widening is always allowed. Only a date that
-- counts is guarded — one inside the range as it was; a frozen date from
-- before H24 on a one-day splash, which never placed anything, holds
-- nothing back when that splash becomes a range.
--
-- Additive: one trigger function replaced (it only relaxes), one function
-- and one trigger added. Nothing dropped, no data changed. Production has no
-- dated ripple outside its range splash (checked before the push).

-- ---------------------------------------------------------------------------
-- the freeze, relaxed for a day inside a range
-- ---------------------------------------------------------------------------

create or replace function public.hold_ripple_inheritance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  checked boolean;
begin
  if new.splash_id is null then
    raise exception 'a ripple belongs to a splash' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.category_id is not null
       or new.occurred_time is not null
       or new.ended_at is not null
       or new.parent_ripple_id is not null then
      raise exception 'a ripple takes its lane and date from its splash' using errcode = '23514';
    end if;
    checked := new.occurred_on is not null;
  else
    if new.category_id is distinct from old.category_id
       or new.occurred_time is distinct from old.occurred_time
       or new.ended_at is distinct from old.ended_at
       or new.started_at is distinct from old.started_at
       or new.parent_ripple_id is distinct from old.parent_ripple_id then
      raise exception 'a ripple''s own lane and date are kept as written' using errcode = '23514';
    end if;
    -- A day is checked when it is set or changed here, or carried to
    -- another splash; one left as it was stays as written.
    checked := new.occurred_on is not null
               and (new.occurred_on is distinct from old.occurred_on
                    or new.splash_id is distinct from old.splash_id);
    -- Cleared: allowed only where a day could be set, a range splash.
    if new.occurred_on is null and old.occurred_on is not null then
      select declared_end into s from public.splashes where id = new.splash_id;
      if s.declared_end is null then
        raise exception 'a ripple''s own lane and date are kept as written' using errcode = '23514';
      end if;
    end if;
  end if;

  if checked then
    select coalesce(declared_start, written_on) as start, declared_end
      into s
      from public.splashes where id = new.splash_id;
    if s.declared_end is null then
      raise exception 'a ripple takes its splash''s date: this splash has no range'
        using errcode = '23514';
    end if;
    if new.occurred_on < s.start or new.occurred_on > s.declared_end then
      raise exception 'That day is outside this splash''s range.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- a range does not shrink past a dated ripple
-- ---------------------------------------------------------------------------

create function public.hold_dated_ripples()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_start date := coalesce(new.declared_start, new.written_on);
begin
  -- Only dates that count: inside the range as it was. A splash with no end
  -- date had no dated ripple that placed anything.
  if old.declared_end is null then
    return new;
  end if;
  if exists (
    select 1 from public.ripples r
     where r.splash_id = new.id
       and r.occurred_on between coalesce(old.declared_start, old.written_on) and old.declared_end
       and (new.declared_end is null
            or r.occurred_on < next_start
            or r.occurred_on > new.declared_end)
  ) then
    raise exception 'Some entries are dated outside this range.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger splashes_hold_dated_ripples
  before update of declared_start, declared_end on public.splashes
  for each row execute function public.hold_dated_ripples();

comment on column public.ripples.occurred_on is
  'A ripple''s own day (0031): set only on a splash with an end date, within its range; frozen as written elsewhere (H24, 0029).';
