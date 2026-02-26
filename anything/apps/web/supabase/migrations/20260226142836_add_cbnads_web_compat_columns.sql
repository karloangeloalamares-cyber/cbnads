-- Compatibility columns for existing route contracts.

alter table if exists cbnads_web_advertisers
  add column if not exists phone_number text,
  add column if not exists total_spend numeric(12,2) not null default 0,
  add column if not exists status text not null default 'active';

update cbnads_web_advertisers
set
  phone_number = coalesce(phone_number, phone),
  total_spend = coalesce(total_spend, ad_spend);

alter table if exists cbnads_web_products
  add column if not exists placement text not null default 'Standard';

alter table if exists cbnads_web_admin_settings
  add column if not exists max_ads_per_day integer not null default 5;

update cbnads_web_admin_settings
set max_ads_per_day = greatest(
  coalesce(max_ads_per_day, 0),
  coalesce(max_ads_per_slot, 0),
  1
);
