-- 008_create_payments_audit.sql

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  created_by uuid references public.profiles(id),
  invoice_id uuid references public.invoices(id) not null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null,
  status text check (status in ('pending', 'cleared', 'failed')) default 'pending',
  reference text,
  attachment_url text,
  received_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.payments enable row level security;
-- Audit Logs (Append Only)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  actor_user_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.audit_logs enable row level security;
