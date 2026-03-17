-- Phase 2 integrity hardening:
-- Enforce ad slot/day capacity in DB to remove check-then-insert race windows.

create or replace function public.cbnads_web_normalize_post_type(p_post_type text)
returns text
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(lower(coalesce(p_post_type, 'one_time')), '[-\s]+', '_', 'g') as value
  )
  select case
    when value in ('one_time', 'one_time_post') then 'one_time'
    when value in ('daily', 'daily_run') then 'daily_run'
    when value in ('custom', 'custom_schedule') then 'custom_schedule'
    else value
  end
  from normalized;
$$;

create or replace function public.cbnads_web_schedule_dates(
  p_post_type text,
  p_schedule date,
  p_post_date date,
  p_post_date_from date,
  p_post_date_to date,
  p_custom_dates jsonb
)
returns date[]
language plpgsql
immutable
as $$
declare
  v_post_type text := public.cbnads_web_normalize_post_type(p_post_type);
  v_from date := coalesce(p_post_date_from, p_schedule, p_post_date);
  v_to date := coalesce(p_post_date_to, coalesce(p_post_date_from, p_schedule, p_post_date));
  v_dates date[] := '{}'::date[];
begin
  if v_post_type = 'daily_run' then
    if v_from is null or v_to is null or v_from > v_to then
      return '{}'::date[];
    end if;

    select coalesce(array_agg(day_value::date order by day_value), '{}'::date[])
    into v_dates
    from generate_series(v_from, v_to, interval '1 day') as day_value;

    return v_dates;
  end if;

  if v_post_type = 'custom_schedule' then
    select coalesce(array_agg(distinct parsed_date order by parsed_date), '{}'::date[])
    into v_dates
    from (
      select case
        when raw_text ~ '^\d{4}-\d{2}-\d{2}$' then raw_text::date
        else null
      end as parsed_date
      from (
        select nullif(
          lower(
            coalesce(
              nullif(value->>'date', ''),
              nullif(trim(both '"' from value::text), '')
            )
          ),
          'null'
        ) as raw_text
        from jsonb_array_elements(coalesce(p_custom_dates, '[]'::jsonb)) as value
      ) as raw_dates
    ) as parsed_dates
    where parsed_date is not null;

    return v_dates;
  end if;

  if v_from is null then
    return '{}'::date[];
  end if;

  return array[v_from];
end;
$$;

create or replace function public.cbnads_web_assert_slot_capacity(
  p_source text,
  p_row_id uuid,
  p_status text,
  p_archived boolean,
  p_rejected_at timestamptz,
  p_linked_ad_id uuid,
  p_linked_invoice_id uuid,
  p_post_type text,
  p_schedule date,
  p_post_date date,
  p_post_date_from date,
  p_post_date_to date,
  p_custom_dates jsonb,
  p_post_time time
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_source text := lower(coalesce(p_source, ''));
  v_status text := lower(coalesce(p_status, ''));
  v_post_type text := public.cbnads_web_normalize_post_type(p_post_type);
  v_dates date[] := public.cbnads_web_schedule_dates(
    p_post_type,
    p_schedule,
    p_post_date,
    p_post_date_from,
    p_post_date_to,
    p_custom_dates
  );
  v_day date;
  v_max_ads_per_day integer := 5;
  v_existing_ads integer := 0;
  v_existing_pending integer := 0;
  v_existing_time_conflicts integer := 0;
begin
  if v_source not in ('ads', 'pending_ads') then
    raise exception 'invalid_slot_capacity_source';
  end if;

  if v_source = 'ads' then
    if coalesce(p_archived, false)
      or v_status not in ('scheduled', 'approved', 'posted', 'published', 'active')
    then
      return;
    end if;
  else
    if v_status <> 'pending'
      or p_rejected_at is not null
      or p_linked_ad_id is not null
      or p_linked_invoice_id is not null
    then
      return;
    end if;
  end if;

  if coalesce(array_length(v_dates, 1), 0) = 0 then
    return;
  end if;

  select greatest(coalesce(max_ads_per_day, 0), coalesce(max_ads_per_slot, 0), 5)
  into v_max_ads_per_day
  from public.cbnads_web_admin_settings
  order by id asc
  limit 1;
  v_max_ads_per_day := greatest(coalesce(v_max_ads_per_day, 5), 1);

  foreach v_day in array v_dates loop
    perform pg_advisory_xact_lock(41721, hashtext(v_day::text));

    if v_post_type = 'one_time' and p_post_time is not null then
      perform pg_advisory_xact_lock(
        41722,
        hashtext(v_day::text || ' ' || to_char(p_post_time, 'HH24:MI:SS'))
      );
    end if;

    select count(*)
    into v_existing_ads
    from public.cbnads_web_ads as ads
    where (v_source <> 'ads' or p_row_id is null or ads.id <> p_row_id)
      and coalesce(ads.archived, false) = false
      and lower(coalesce(ads.status, '')) in ('scheduled', 'approved', 'posted', 'published', 'active')
      and v_day = any(
        public.cbnads_web_schedule_dates(
          ads.post_type,
          ads.schedule,
          ads.post_date,
          ads.post_date_from,
          ads.post_date_to,
          ads.custom_dates
        )
      );

    select count(*)
    into v_existing_pending
    from public.cbnads_web_pending_ads as pending
    where (v_source <> 'pending_ads' or p_row_id is null or pending.id <> p_row_id)
      and lower(coalesce(pending.status, '')) = 'pending'
      and pending.rejected_at is null
      and pending.linked_ad_id is null
      and pending.linked_invoice_id is null
      and v_day = any(
        public.cbnads_web_schedule_dates(
          pending.post_type,
          null,
          pending.post_date,
          pending.post_date_from,
          pending.post_date_to,
          pending.custom_dates
        )
      );

    if (v_existing_ads + v_existing_pending) >= v_max_ads_per_day then
      raise exception 'slot_day_full:%', to_char(v_day, 'YYYY-MM-DD');
    end if;

    if v_post_type = 'one_time' and p_post_time is not null then
      select count(*)
      into v_existing_time_conflicts
      from (
        select ads.id
        from public.cbnads_web_ads as ads
        where (v_source <> 'ads' or p_row_id is null or ads.id <> p_row_id)
          and coalesce(ads.archived, false) = false
          and lower(coalesce(ads.status, '')) in ('scheduled', 'approved', 'posted', 'published', 'active')
          and public.cbnads_web_normalize_post_type(ads.post_type) = 'one_time'
          and ads.post_time = p_post_time
          and v_day = any(
            public.cbnads_web_schedule_dates(
              ads.post_type,
              ads.schedule,
              ads.post_date,
              ads.post_date_from,
              ads.post_date_to,
              ads.custom_dates
            )
          )

        union all

        select pending.id
        from public.cbnads_web_pending_ads as pending
        where (v_source <> 'pending_ads' or p_row_id is null or pending.id <> p_row_id)
          and lower(coalesce(pending.status, '')) = 'pending'
          and pending.rejected_at is null
          and pending.linked_ad_id is null
          and pending.linked_invoice_id is null
          and public.cbnads_web_normalize_post_type(pending.post_type) = 'one_time'
          and pending.post_time = p_post_time
          and v_day = any(
            public.cbnads_web_schedule_dates(
              pending.post_type,
              null,
              pending.post_date,
              pending.post_date_from,
              pending.post_date_to,
              pending.custom_dates
            )
          )
      ) as conflicts;

      if v_existing_time_conflicts > 0 then
        raise exception 'slot_time_blocked:% %',
          to_char(v_day, 'YYYY-MM-DD'),
          to_char(p_post_time, 'HH24:MI:SS');
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.cbnads_web_enforce_ads_slot_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.archived is not distinct from old.archived
    and new.post_type is not distinct from old.post_type
    and new.schedule is not distinct from old.schedule
    and new.post_date is not distinct from old.post_date
    and new.post_date_from is not distinct from old.post_date_from
    and new.post_date_to is not distinct from old.post_date_to
    and new.custom_dates is not distinct from old.custom_dates
    and new.post_time is not distinct from old.post_time
  then
    return new;
  end if;

  perform public.cbnads_web_assert_slot_capacity(
    'ads',
    new.id,
    new.status,
    new.archived,
    null,
    null,
    null,
    new.post_type,
    new.schedule,
    new.post_date,
    new.post_date_from,
    new.post_date_to,
    new.custom_dates,
    new.post_time
  );

  return new;
end;
$$;

create or replace function public.cbnads_web_enforce_pending_ads_slot_capacity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.rejected_at is not distinct from old.rejected_at
    and new.linked_ad_id is not distinct from old.linked_ad_id
    and new.linked_invoice_id is not distinct from old.linked_invoice_id
    and new.post_type is not distinct from old.post_type
    and new.post_date is not distinct from old.post_date
    and new.post_date_from is not distinct from old.post_date_from
    and new.post_date_to is not distinct from old.post_date_to
    and new.custom_dates is not distinct from old.custom_dates
    and new.post_time is not distinct from old.post_time
  then
    return new;
  end if;

  perform public.cbnads_web_assert_slot_capacity(
    'pending_ads',
    new.id,
    new.status,
    false,
    new.rejected_at,
    new.linked_ad_id,
    new.linked_invoice_id,
    new.post_type,
    null,
    new.post_date,
    new.post_date_from,
    new.post_date_to,
    new.custom_dates,
    new.post_time
  );

  return new;
end;
$$;

drop trigger if exists cbnads_web_ads_slot_capacity_guard on public.cbnads_web_ads;
create trigger cbnads_web_ads_slot_capacity_guard
before insert or update
on public.cbnads_web_ads
for each row
execute function public.cbnads_web_enforce_ads_slot_capacity();

drop trigger if exists cbnads_web_pending_ads_slot_capacity_guard on public.cbnads_web_pending_ads;
create trigger cbnads_web_pending_ads_slot_capacity_guard
before insert or update
on public.cbnads_web_pending_ads
for each row
execute function public.cbnads_web_enforce_pending_ads_slot_capacity();
