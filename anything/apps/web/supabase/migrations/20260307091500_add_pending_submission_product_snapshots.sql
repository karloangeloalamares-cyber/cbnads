alter table if exists public.cbnads_web_pending_ads
  add column if not exists product_name text,
  add column if not exists price numeric(12,2) not null default 0;
