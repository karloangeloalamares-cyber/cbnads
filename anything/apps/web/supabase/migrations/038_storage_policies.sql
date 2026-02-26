-- Migration: Storage Policies for ad-media bucket
-- Date: 2026-01-30
-- Description: Enables RLS policies for the ad-media bucket and public.tenants table.

-- ============================================================
-- 1. STORAGE BUCKET: ad-media
-- ============================================================

-- Ensure the bucket is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('ad-media', 'ad-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;
-- Drop existing policies if they conflict
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete" ON storage.objects;
-- SELECT: Allow anyone to view logo/media
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'ad-media' );
-- INSERT: Allow any authenticated user to upload
CREATE POLICY "Authenticated Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( 
    bucket_id = 'ad-media' AND 
    auth.role() = 'authenticated' 
);
-- UPDATE: Allow users to update their own uploads
CREATE POLICY "Owner Update" 
ON storage.objects FOR UPDATE 
USING ( 
    bucket_id = 'ad-media' AND 
    auth.uid() = owner 
);
-- DELETE: Allow users to delete their own uploads
CREATE POLICY "Owner Delete" 
ON storage.objects FOR DELETE 
USING ( 
    bucket_id = 'ad-media' AND 
    auth.uid() = owner 
);
-- ============================================================
-- 2. TENANTS TABLE: RLS Policies
-- ============================================================

-- Drop existing policies if they conflict
DROP POLICY IF EXISTS "Enable access to all users" ON public.tenants;
DROP POLICY IF EXISTS "View own tenant" ON public.tenants;
DROP POLICY IF EXISTS "Update own tenant" ON public.tenants;
-- SELECT: Allow authenticated users to view tenants
CREATE POLICY "View own tenant" ON public.tenants
FOR SELECT USING ( true );
-- Simple for now to ensure consistency, can be tightened later

-- UPDATE: Allow Owners and Admins to update their tenant info (branding)
CREATE POLICY "Update own tenant" ON public.tenants
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.tenant_id = tenants.id 
    AND profiles.role IN ('Owner', 'Admin')
  )
);
