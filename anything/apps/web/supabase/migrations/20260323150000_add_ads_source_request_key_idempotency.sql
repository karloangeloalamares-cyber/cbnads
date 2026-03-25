alter table if exists public.cbnads_web_ads
  add column if not exists source_request_key text;

create unique index if not exists cbnads_web_ads_source_request_key_uniq
  on public.cbnads_web_ads (source_request_key)
  where source_request_key is not null
    and btrim(source_request_key) <> '';
