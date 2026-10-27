-- 0042: H24 release 2 — a ripple's own lane goes (2026-10-26).
--
-- H24 (0028/0029): a ripple takes its splash's lane and date and has none
-- of its own; release 1 froze `ripples.category_id` as metadata read back
-- for nothing. Release 2 drops it, as its own migration after the sharing
-- contract (0040) was verified (Yoonji, in the session: kept separate from
-- the contract). The other frozen date fields stay, as decided then.
--
-- Destructive DDL, approved by Yoonji in the session:
--   "I approve migration 0041 (H24 release 2): dropping ripples.category_id
--   and its foreign key, erasing the stored value on the 51 production
--   ripples that still carry it, dropping the ripples_check_lane trigger and
--   check_ripple_lane, and removing the column check from
--   hold_ripple_inheritance."
--   (Approved as 0041; renumbered 0042 when the helper below took 0041.)
--   Her condition, met by 0041 and shipped first: "a ripple shown alone
--   because its splash is unreadable (I left that pool) goes to that pool's
--   'A pool you left' column on Home, never laneless or hidden."
--
-- What is lost: the lane value 51 of production's 61 ripples still carry,
-- frozen since 0029. A ripple read alone (its splash unreadable, a pool
-- left) is placed in that pool's column by my_left_pool_ripples (0041);
-- every other ripple was placed by its splash already.
--
--   hold_ripple_inheritance  no longer guards the column (it is gone)
--   ripples_check_lane       a no-op trigger since 0029, on the column
--   ripples.category_id      with its foreign key to my_categories

create or replace function public.hold_ripple_inheritance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s record;
  checked boolean;
begin
  if new.splash_id is null then
    raise exception 'a ripple belongs to a splash' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.occurred_time is not null
       or new.ended_at is not null
       or new.parent_ripple_id is not null then
      raise exception 'a ripple takes its lane and date from its splash' using errcode = '23514';
    end if;
    checked := new.occurred_on is not null;
  else
    if new.occurred_time is distinct from old.occurred_time
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
$function$;

drop trigger ripples_check_lane on public.ripples;
drop function public.check_ripple_lane();
alter table public.ripples drop column category_id;
