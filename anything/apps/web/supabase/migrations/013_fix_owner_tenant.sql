-- =====================================================
-- FIX: Ensure Owner user is properly configured
-- Run this in Supabase SQL Editor
-- =====================================================

-- Step 1: Check current state of both Owner profiles
SELECT 
    id, 
    full_name, 
    email, 
    role, 
    tenant_id,
    created_at
FROM public.profiles 
WHERE role = 'Owner' OR id = '11184062-63fc-4bf4-93f3-92f0e8c9a188'
ORDER BY created_at;
-- Step 2: Get the primary tenant (first one created)
-- We'll use this to link all Owners
DO $$
DECLARE
    primary_tenant_id uuid;
BEGIN
    -- Get the first tenant created
    SELECT id INTO primary_tenant_id 
    FROM public.tenants 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    -- If no tenant exists, create one
    IF primary_tenant_id IS NULL THEN
        INSERT INTO public.tenants (name) VALUES ('Default Organization')
        RETURNING id INTO primary_tenant_id;
        RAISE NOTICE 'Created new tenant: %', primary_tenant_id;
    END IF;
    
    -- Step 3: Update the second Owner to have correct role and tenant
    UPDATE public.profiles 
    SET 
        role = 'Owner',
        tenant_id = primary_tenant_id,
        updated_at = now()
    WHERE id = '11184062-63fc-4bf4-93f3-92f0e8c9a188';
    
    RAISE NOTICE 'Updated user 11184062-63fc-4bf4-93f3-92f0e8c9a188 to Owner with tenant_id: %', primary_tenant_id;
    
    -- Step 4: Make sure all Owners share the same tenant for management visibility
    UPDATE public.profiles 
    SET tenant_id = primary_tenant_id
    WHERE role = 'Owner' AND tenant_id IS DISTINCT FROM primary_tenant_id;
    
    RAISE NOTICE 'All Owners now linked to tenant: %', primary_tenant_id;
END $$;
-- Step 5: Verify the fix
SELECT 
    id, 
    full_name, 
    email, 
    role, 
    tenant_id,
    created_at
FROM public.profiles 
ORDER BY created_at;
