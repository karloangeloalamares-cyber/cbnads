-- Phase 8 integrity hardening:
-- Atomically convert pending submissions to ads with DB-level idempotency reuse.

create or replace function public.cbnads_web_convert_pending_to_ad_atomic(
  p_pending_ad_id uuid,
  p_ad jsonb default '{}'::jsonb,
  p_delete_pending boolean default true
)
returns table (
  ad_id uuid,
  created boolean,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad jsonb := coalesce(p_ad, '{}'::jsonb);
  v_existing_ad_id uuid;
  v_new_ad_id uuid;
begin
  if p_pending_ad_id is null then
    raise exception 'pending_ad_id is required';
  end if;

  if coalesce(jsonb_typeof(v_ad), 'object') <> 'object' then
    raise exception 'ad payload must be an object';
  end if;

  perform pg_advisory_xact_lock(41724, hashtext(p_pending_ad_id::text));

  select ads.id
  into v_existing_ad_id
  from public.cbnads_web_ads as ads
  where ads.source_pending_ad_id = p_pending_ad_id
  order by ads.created_at desc
  limit 1;

  if v_existing_ad_id is not null then
    if coalesce(p_delete_pending, false) then
      delete from public.cbnads_web_pending_ads
      where id = p_pending_ad_id;
    end if;

    return query
    select v_existing_ad_id, false, 'idempotency_reuse';
    return;
  end if;

  perform 1
  from public.cbnads_web_pending_ads as pending
  where pending.id = p_pending_ad_id
  for update;

  if not found then
    raise exception 'pending_not_found';
  end if;

  begin
    insert into public.cbnads_web_ads (
      ad_name,
      advertiser,
      advertiser_id,
      source_pending_ad_id,
      product_id,
      product_name,
      price,
      status,
      payment,
      post_type,
      placement,
      schedule,
      post_date,
      post_date_from,
      post_date_to,
      custom_dates,
      post_time,
      scheduled_timezone,
      reminder_minutes,
      ad_text,
      media,
      notes,
      series_id,
      series_index,
      series_total,
      series_week_start,
      created_at,
      updated_at
    )
    values (
      nullif(btrim(coalesce(v_ad->>'ad_name', '')), ''),
      nullif(btrim(coalesce(v_ad->>'advertiser', '')), ''),
      nullif(btrim(coalesce(v_ad->>'advertiser_id', '')), '')::uuid,
      p_pending_ad_id,
      nullif(btrim(coalesce(v_ad->>'product_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_ad->>'product_name', '')), ''),
      round(coalesce(nullif(btrim(coalesce(v_ad->>'price', '')), '')::numeric, 0), 2),
      coalesce(nullif(btrim(coalesce(v_ad->>'status', '')), ''), 'Draft'),
      coalesce(nullif(btrim(coalesce(v_ad->>'payment', '')), ''), 'Pending'),
      coalesce(nullif(btrim(coalesce(v_ad->>'post_type', '')), ''), 'one_time'),
      nullif(btrim(coalesce(v_ad->>'placement', '')), ''),
      nullif(btrim(coalesce(v_ad->>'schedule', '')), '')::date,
      nullif(btrim(coalesce(v_ad->>'post_date', '')), '')::date,
      nullif(btrim(coalesce(v_ad->>'post_date_from', '')), '')::date,
      nullif(btrim(coalesce(v_ad->>'post_date_to', '')), '')::date,
      case
        when jsonb_typeof(coalesce(v_ad->'custom_dates', '[]'::jsonb)) = 'array'
          then coalesce(v_ad->'custom_dates', '[]'::jsonb)
        else '[]'::jsonb
      end,
      nullif(btrim(coalesce(v_ad->>'post_time', '')), '')::time,
      nullif(btrim(coalesce(v_ad->>'scheduled_timezone', '')), ''),
      greatest(coalesce(nullif(btrim(coalesce(v_ad->>'reminder_minutes', '')), '')::integer, 15), 0),
      nullif(coalesce(v_ad->>'ad_text', ''), ''),
      case
        when jsonb_typeof(coalesce(v_ad->'media', '[]'::jsonb)) = 'array'
          then coalesce(v_ad->'media', '[]'::jsonb)
        else '[]'::jsonb
      end,
      nullif(coalesce(v_ad->>'notes', ''), ''),
      nullif(btrim(coalesce(v_ad->>'series_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_ad->>'series_index', '')), '')::integer,
      nullif(btrim(coalesce(v_ad->>'series_total', '')), '')::integer,
      nullif(btrim(coalesce(v_ad->>'series_week_start', '')), '')::date,
      coalesce(nullif(btrim(coalesce(v_ad->>'created_at', '')), '')::timestamptz, now()),
      coalesce(nullif(btrim(coalesce(v_ad->>'updated_at', '')), '')::timestamptz, now())
    )
    returning id into v_new_ad_id;
  exception when unique_violation then
    select ads.id
    into v_existing_ad_id
    from public.cbnads_web_ads as ads
    where ads.source_pending_ad_id = p_pending_ad_id
    order by ads.created_at desc
    limit 1;

    if v_existing_ad_id is not null then
      if coalesce(p_delete_pending, false) then
        delete from public.cbnads_web_pending_ads
        where id = p_pending_ad_id;
      end if;

      return query
      select v_existing_ad_id, false, 'idempotency_reuse';
      return;
    end if;

    raise;
  end;

  if coalesce(p_delete_pending, false) then
    delete from public.cbnads_web_pending_ads
    where id = p_pending_ad_id;
  end if;

  return query
  select v_new_ad_id, true, 'created';
end;
$$;

revoke execute on function public.cbnads_web_convert_pending_to_ad_atomic(
  uuid,
  jsonb,
  boolean
)
from public, anon, authenticated;

grant execute on function public.cbnads_web_convert_pending_to_ad_atomic(
  uuid,
  jsonb,
  boolean
)
to service_role;
