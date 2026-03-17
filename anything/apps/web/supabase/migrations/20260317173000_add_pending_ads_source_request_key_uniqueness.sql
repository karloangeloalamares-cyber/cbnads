-- Phase 7 integrity hardening:
-- Add DB-backed idempotency keys for pending ad submissions.

alter table if exists public.cbnads_web_pending_ads
  add column if not exists source_request_key text;

create unique index if not exists cbnads_web_pending_ads_source_request_key_uniq
  on public.cbnads_web_pending_ads (source_request_key)
  where source_request_key is not null
    and btrim(source_request_key) <> '';
