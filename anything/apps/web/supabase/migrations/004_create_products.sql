-- 004_create_products.sql
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  name text not null,
  description text,
  type text check (type in ('Credit', 'Duration')) not null,
  placement text check (placement in ('WhatsApp', 'Website', 'Both')) not null,
  price numeric(10, 2) not null check (price >= 0),
  currency text default 'USD',
  credits_included integer,
  duration_days integer,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.products enable row level security;
