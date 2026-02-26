-- =====================================================
-- MIGRATION: 040_add_tenant_contact_info.sql
-- Add address, phone, and email to tenants table
-- =====================================================

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT;
-- Verify
SELECT id, name, address, phone, email FROM public.tenants LIMIT 1;
