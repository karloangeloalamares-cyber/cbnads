-- 005_create_orders.sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  advertiser_id uuid references public.advertisers(id) not null,
  product_id uuid references public.products(id) not null,
  status text check (status in ('Draft', 'Active', 'Paused', 'Completed', 'Cancelled')) default 'Active',
  total_amount numeric(10, 2) not null check (total_amount >= 0),
  start_date timestamp with time zone default timezone('utc'::text, now()) not null,
  end_date timestamp with time zone,
  invoice_id uuid, -- Circular reference resolved later or made deferred (nullable for now)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.orders enable row level security;
