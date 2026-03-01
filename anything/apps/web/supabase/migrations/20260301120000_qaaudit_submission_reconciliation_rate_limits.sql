alter table if exists public.cbnads_web_pending_ads
  add column if not exists review_notes text,
  add column if not exists advertiser_id uuid,
  add column if not exists product_id uuid,
  add column if not exists linked_ad_id uuid,
  add column if not exists linked_invoice_id uuid;

create table if not exists public.cbnads_web_reconciliation_case_reviews (
  case_key text primary key,
  case_type text not null,
  invoice_id uuid null,
  ad_id uuid null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'dismissed')),
  note text null,
  reviewed_by uuid null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cbnads_web_public_submission_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempt_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cbnads_web_pending_ads_linked_ad_id_idx
  on public.cbnads_web_pending_ads (linked_ad_id);

create index if not exists cbnads_web_pending_ads_linked_invoice_id_idx
  on public.cbnads_web_pending_ads (linked_invoice_id);

create index if not exists cbnads_web_reconciliation_case_reviews_status_idx
  on public.cbnads_web_reconciliation_case_reviews (status);
