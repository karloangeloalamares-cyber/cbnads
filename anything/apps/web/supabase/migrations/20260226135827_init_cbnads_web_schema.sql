-- Namespace prefix for this app: cbnads_web_
-- If you use another namespace, duplicate this file and replace the prefix.

create extension if not exists pgcrypto;

create table if not exists cbnads_web_advertisers (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  contact_name text,
  email text,
  phone text,
  business_name text,
  ad_spend numeric(12,2) not null default 0,
  next_ad_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  price numeric(12,2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_ads (
  id uuid primary key default gen_random_uuid(),
  ad_name text not null,
  advertiser_id uuid references cbnads_web_advertisers(id) on delete set null,
  advertiser text,
  product_id uuid references cbnads_web_products(id) on delete set null,
  product_name text,
  post_type text not null default 'one_time',
  status text not null default 'Draft',
  payment text not null default 'Unpaid',
  post_date date,
  post_date_from date,
  post_date_to date,
  post_time time,
  custom_dates jsonb not null default '[]'::jsonb,
  notes text,
  ad_text text,
  media jsonb not null default '[]'::jsonb,
  media_urls jsonb not null default '[]'::jsonb,
  placement text,
  reminder_minutes integer not null default 15,
  price numeric(12,2) not null default 0,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_pending_ads (
  id uuid primary key default gen_random_uuid(),
  advertiser_name text not null,
  contact_name text,
  email text,
  phone text,
  phone_number text,
  business_name text,
  ad_name text not null,
  post_type text not null default 'one_time',
  post_date date,
  post_date_from date,
  post_date_to date,
  custom_dates jsonb not null default '[]'::jsonb,
  post_time time,
  reminder_minutes integer not null default 15,
  ad_text text,
  media jsonb not null default '[]'::jsonb,
  placement text,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  advertiser_id uuid references cbnads_web_advertisers(id) on delete set null,
  advertiser_name text,
  amount numeric(12,2) not null default 0,
  due_date date,
  status text not null default 'Unpaid',
  paid_date date,
  ad_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_admin_settings (
  id bigint primary key generated always as identity,
  max_ads_per_slot integer not null default 2,
  default_post_time time not null default '09:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_notification_preferences (
  id bigint primary key generated always as identity,
  email_enabled boolean not null default false,
  reminder_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cbnads_web_team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cbnads_web_ads_post_date on cbnads_web_ads(post_date);
create index if not exists idx_cbnads_web_ads_advertiser on cbnads_web_ads(advertiser_id);
create index if not exists idx_cbnads_web_pending_ads_status on cbnads_web_pending_ads(status);
create index if not exists idx_cbnads_web_invoices_advertiser on cbnads_web_invoices(advertiser_id);

insert into cbnads_web_admin_settings (max_ads_per_slot, default_post_time)
select 2, '09:00'
where not exists (select 1 from cbnads_web_admin_settings);

insert into cbnads_web_notification_preferences (email_enabled, reminder_email)
select false, ''
where not exists (select 1 from cbnads_web_notification_preferences);

