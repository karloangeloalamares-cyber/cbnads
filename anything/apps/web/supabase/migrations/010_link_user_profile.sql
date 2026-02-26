-- 010_link_user_profile.sql
-- Goal: Link the authenticated user (Karlo Alamares) to the Default Tenant
-- This satisfies the RLS "same_tenant" policy required for viewing Products.

-- 1. Get the Default Tenant ID (for reference)
-- Assuming: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' (from seed.sql)

-- 2. Insert/Update Profile for the Authenticated User
-- We use a placeholder UUID here, but in production/running this SQL, 
-- you would typically use `auth.uid()` if running inside an RLS context 
-- or the specific UUID if running manually.

-- For this migration, we'll try to match by email if possible to be safe, 
-- or update the specific ID known from previous sessions.

-- KNOWN USER ID: a6e9d383-2269-4336-9c91-23e8caac4229 (Karlo Alamares)

INSERT INTO public.profiles (id, tenant_id, role, full_name)
VALUES (
    'a6e9d383-2269-4336-9c91-23e8caac4229', -- The Auth User UUID
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Default Tenant
    'Owner',
    'Karlo Alamares'
)
ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role;
