-- Deduplicate advertiser records by normalized email and prevent future duplicates.
-- This migration also rewires dependent records to keep a canonical advertiser id.

update cbnads_web_advertisers
set
  email = nullif(lower(btrim(email)), ''),
  advertiser_name = btrim(coalesce(advertiser_name, '')),
  contact_name = nullif(btrim(coalesce(contact_name, '')), ''),
  business_name = nullif(btrim(coalesce(business_name, '')), ''),
  phone = nullif(btrim(coalesce(phone, '')), ''),
  phone_number = nullif(btrim(coalesce(phone_number, '')), ''),
  updated_at = coalesce(updated_at, now());

do $$
declare
  grp record;
  keep_id uuid;
  loser_ids uuid[];
  merged_credits numeric(12,2);
  merged_ad_spend numeric(12,2);
  merged_total_spend numeric(12,2);
  fallback_name text;
  fallback_contact text;
  fallback_phone text;
  fallback_phone_number text;
begin
  for grp in
    select
      lower(btrim(email)) as email_key,
      array_agg(
        id
        order by
          coalesce(total_spend, ad_spend, 0) desc,
          coalesce(ad_spend, total_spend, 0) desc,
          coalesce(credits, 0) desc,
          updated_at desc nulls last,
          created_at asc nulls last,
          id asc
      ) as ids
    from cbnads_web_advertisers
    where nullif(lower(btrim(email)), '') is not null
    group by lower(btrim(email))
    having count(*) > 1
  loop
    keep_id := grp.ids[1];
    loser_ids := case
      when array_length(grp.ids, 1) > 1 then grp.ids[2:array_length(grp.ids, 1)]
      else '{}'::uuid[]
    end;

    if coalesce(array_length(loser_ids, 1), 0) = 0 then
      continue;
    end if;

    select
      round(sum(coalesce(credits, 0))::numeric, 2),
      round(max(coalesce(ad_spend, 0))::numeric, 2),
      round(max(coalesce(total_spend, ad_spend, 0))::numeric, 2),
      nullif(max(nullif(btrim(advertiser_name), '')), ''),
      nullif(max(nullif(btrim(contact_name), '')), ''),
      nullif(max(nullif(btrim(phone), '')), ''),
      nullif(max(nullif(btrim(phone_number), '')), '')
    into
      merged_credits,
      merged_ad_spend,
      merged_total_spend,
      fallback_name,
      fallback_contact,
      fallback_phone,
      fallback_phone_number
    from cbnads_web_advertisers
    where id = any(grp.ids);

    update cbnads_web_ads
    set advertiser_id = keep_id
    where advertiser_id = any(loser_ids);

    update cbnads_web_invoices
    set advertiser_id = keep_id
    where advertiser_id = any(loser_ids);

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'cbnads_web_pending_ads'
        and column_name = 'advertiser_id'
    ) then
      update cbnads_web_pending_ads
      set advertiser_id = keep_id
      where advertiser_id = any(loser_ids);
    end if;

    if to_regclass('public.cbnads_web_credit_ledger') is not null then
      update cbnads_web_credit_ledger
      set advertiser_id = keep_id
      where advertiser_id = any(loser_ids);
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'advertiser_id'
    ) then
      update profiles
      set advertiser_id = keep_id
      where advertiser_id = any(loser_ids);
    end if;

    update cbnads_web_advertisers
    set
      advertiser_name = coalesce(nullif(btrim(advertiser_name), ''), fallback_name, advertiser_name),
      contact_name = coalesce(nullif(btrim(contact_name), ''), fallback_contact),
      phone = coalesce(nullif(btrim(phone), ''), fallback_phone),
      phone_number = coalesce(nullif(btrim(phone_number), ''), fallback_phone_number),
      credits = coalesce(merged_credits, coalesce(credits, 0)),
      ad_spend = greatest(coalesce(ad_spend, 0), coalesce(merged_ad_spend, 0)),
      total_spend = greatest(coalesce(total_spend, ad_spend, 0), coalesce(merged_total_spend, 0)),
      updated_at = now()
    where id = keep_id;

    delete from cbnads_web_advertisers
    where id = any(loser_ids);
  end loop;
end;
$$;

create unique index if not exists uq_cbnads_web_advertisers_email
on cbnads_web_advertisers (email)
where email is not null and email <> '';
