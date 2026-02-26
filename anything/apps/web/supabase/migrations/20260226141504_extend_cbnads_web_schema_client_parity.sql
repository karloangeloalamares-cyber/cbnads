-- Extend namespaced schema toward client SQL parity (no storage buckets required).

create extension if not exists pgcrypto;

-- Ads: add publish/payment-link fields used by scheduling and billing flows.
alter table if exists cbnads_web_ads
  add column if not exists schedule date,
  add column if not exists archived boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists published_dates jsonb not null default '[]'::jsonb,
  add column if not exists paid_via_invoice_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cbnads_web_ads_paid_via_invoice_id_fkey'
  ) then
    alter table cbnads_web_ads
      add constraint cbnads_web_ads_paid_via_invoice_id_fkey
      foreign key (paid_via_invoice_id)
      references cbnads_web_invoices(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_cbnads_web_ads_paid_via_invoice_id
  on cbnads_web_ads(paid_via_invoice_id);

create index if not exists idx_cbnads_web_ads_published_dates
  on cbnads_web_ads using gin (published_dates);

-- Pending submissions: moderation flags
alter table if exists cbnads_web_pending_ads
  add column if not exists rejected_at timestamptz,
  add column if not exists viewed_by_admin boolean not null default false;

create index if not exists idx_cbnads_web_pending_ads_viewed_status
  on cbnads_web_pending_ads(viewed_by_admin, status);

-- Invoices: extend with operational fields used in client schema.
alter table if exists cbnads_web_invoices
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists bill_to text,
  add column if not exists issue_date date not null default current_date,
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists tax numeric(12,2) not null default 0,
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists notes text,
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_period text,
  add column if not exists last_generated_at timestamptz;

create index if not exists idx_cbnads_web_invoices_status
  on cbnads_web_invoices(status);

-- Invoice items: separate line-item ledger.
create table if not exists cbnads_web_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references cbnads_web_invoices(id) on delete cascade,
  ad_id uuid references cbnads_web_ads(id) on delete set null,
  product_id uuid references cbnads_web_products(id) on delete set null,
  description text not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cbnads_web_invoice_items_invoice_id
  on cbnads_web_invoice_items(invoice_id);

-- Reminder send history.
create table if not exists cbnads_web_sent_reminders (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references cbnads_web_ads(id) on delete cascade,
  sent_at timestamptz not null default now(),
  reminder_type text not null default 'scheduled',
  recipient_type text not null default 'admin'
);

create index if not exists idx_cbnads_web_sent_reminders_ad_id
  on cbnads_web_sent_reminders(ad_id);

-- Per-admin notification preferences (future auth/team integration).
create table if not exists cbnads_web_admin_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  reminder_time_value integer not null default 1,
  reminder_time_unit text not null default 'hours',
  email_address text,
  phone_number text,
  sound_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
