-- Phase 3 integrity hardening:
-- Make pending submission conversion/approval idempotent at DB level.

alter table if exists public.cbnads_web_ads
  add column if not exists source_pending_ad_id uuid;

create unique index if not exists cbnads_web_ads_source_pending_ad_id_uniq
  on public.cbnads_web_ads (source_pending_ad_id)
  where source_pending_ad_id is not null;
