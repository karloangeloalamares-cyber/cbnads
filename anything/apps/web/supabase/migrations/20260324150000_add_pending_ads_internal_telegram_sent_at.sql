alter table if exists public.cbnads_web_pending_ads
  add column if not exists internal_telegram_sent_at timestamptz;

create index if not exists idx_cbnads_web_pending_ads_internal_telegram_sent_at
  on public.cbnads_web_pending_ads (internal_telegram_sent_at);
