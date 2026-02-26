-- Migration: Create Supabase Storage bucket for ad media
-- Date: 2026-01-16
-- Fixes: Base64 images stored in database causing 15+ second load times

-- 1. First, clear the bloated base64 data
UPDATE public.ads SET media_urls = ARRAY[]::text[];
-- 2. Create storage bucket for ad media (run in Supabase Dashboard -> Storage)
-- Note: Storage buckets are created via Dashboard or REST API, not SQL
-- This is just documentation:
-- 
-- Bucket Name: ad-media
-- Public: Yes (for easy access)
-- File size limit: 10MB
-- Allowed MIME types: image/*, video/*

-- 3. Re-enable RLS on ads table (we disabled it for testing)
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
-- 4. Create storage policies (if using Supabase Storage SQL API)
-- INSERT policy: Authenticated users can upload
-- SELECT policy: Public can view (since bucket is public)
-- DELETE policy: Owner can delete their own files;
