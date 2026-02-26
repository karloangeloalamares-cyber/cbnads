-- 002_create_profiles.sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id),
  role text not null check (role in ('Owner', 'Admin', 'Manager', 'Assistant', 'Advertiser')),
  advertiser_id uuid, -- Nullable, generic link for Advertiser role
  full_name text,
  email text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Enable RLS
alter table public.profiles enable row level security;
