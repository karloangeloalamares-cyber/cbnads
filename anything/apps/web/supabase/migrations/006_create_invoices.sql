-- 006_create_invoices.sql
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  advertiser_id uuid references public.advertisers(id) not null,
  order_id uuid references public.orders(id), -- Nullable initially
  invoice_number text not null,
  amount_due numeric(10, 2) not null check (amount_due >= 0),
  amount_paid numeric(10, 2) default 0.00 check (amount_paid >= 0),
  balance numeric(10, 2) generated always as (amount_due - amount_paid) stored check (balance >= 0),
  status text check (status in ('Unpaid', 'Partial', 'Paid', 'Void')) default 'Unpaid',
  items jsonb not null default '[]'::jsonb,
  due_date timestamp with time zone not null,
  issued_at timestamp with time zone default timezone('utc'::text, now()) not null,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.invoices enable row level security;
