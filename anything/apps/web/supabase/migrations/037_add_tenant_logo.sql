-- 037_add_tenant_logo.sql
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url text;
