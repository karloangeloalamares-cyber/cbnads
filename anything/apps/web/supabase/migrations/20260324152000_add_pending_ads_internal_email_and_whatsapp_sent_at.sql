alter table if exists public.cbnads_web_pending_ads
  add column if not exists internal_email_sent_at timestamptz,
  add column if not exists admin_whatsapp_sent_at timestamptz;

create index if not exists idx_cbnads_web_pending_ads_internal_email_sent_at
  on public.cbnads_web_pending_ads (internal_email_sent_at);

create index if not exists idx_cbnads_web_pending_ads_admin_whatsapp_sent_at
  on public.cbnads_web_pending_ads (admin_whatsapp_sent_at);
