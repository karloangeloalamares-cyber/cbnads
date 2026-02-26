-- 043_add_ads_missing_columns.sql
-- Adds columns that exist in frontend Ad type but are missing from database
-- Fixes 400 error when updating ads

-- 1. Add custom_dates array for Custom posting type
ALTER TABLE public.ads 
ADD COLUMN IF NOT EXISTS custom_dates text[] DEFAULT ARRAY[]::text[];
-- 2. Add banner_size for Website placement
ALTER TABLE public.ads 
ADD COLUMN IF NOT EXISTS banner_size text DEFAULT '728x90';
-- 3. Add reminder settings columns
ALTER TABLE public.ads 
ADD COLUMN IF NOT EXISTS reminder_enabled boolean DEFAULT false;
ALTER TABLE public.ads 
ADD COLUMN IF NOT EXISTS reminder_minutes_before integer DEFAULT 60;
ALTER TABLE public.ads 
ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone;
