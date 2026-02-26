-- 003_create_advertisers.sql
create table public.advertisers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  business_name text not null,
  contact_person text not null,
  email text not null,
  whatsapp_phone text,
  status text check (status in ('active', 'paused', 'archived')) default 'active',
  credits integer default 0 check (credits >= 0),
  internal_rating integer default 3 check (internal_rating between 1 and 5),
  notes text,
  total_spend numeric(10, 2) default 0.00,
  products_purchased_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.advertisers enable row level security;
