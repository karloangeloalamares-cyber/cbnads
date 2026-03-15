-- Add multi-week series linkage fields (additive, reversible)

alter table if exists cbnads_web_ads
  add column if not exists series_id uuid,
  add column if not exists series_index int,
  add column if not exists series_total int,
  add column if not exists series_week_start date;

create index if not exists idx_cbnads_web_ads_series_id
  on cbnads_web_ads(series_id);

alter table if exists cbnads_web_pending_ads
  add column if not exists series_id uuid,
  add column if not exists series_index int,
  add column if not exists series_total int,
  add column if not exists series_week_start date;

create index if not exists idx_cbnads_web_pending_ads_series_id
  on cbnads_web_pending_ads(series_id);

