-- =====================================================
-- REVERT: Reset branding to default "CBN Ops"
-- Run this in Supabase SQL Editor to clean up for next client
-- =====================================================

-- 1. Reset the active tenant (assumes single tenant context or owner's tenant)
UPDATE public.tenants
SET 
  name = 'CBN Ops',
  logo_url = NULL, -- Will trigger the Globe icon fallback
  updated_at = now()
WHERE id IN (
  SELECT tenant_id 
  FROM public.profiles 
  WHERE role = 'Owner'
  LIMIT 1
);
-- 2. Verify the reset
SELECT id, name, logo_url FROM public.tenants;
