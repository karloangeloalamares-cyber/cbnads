-- 032_add_profile_timezone.sql
-- Add timezone support to profiles for accurate date/time handling across regions

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';
-- Comment for documentation
COMMENT ON COLUMN public.profiles.timezone IS 'Preferred timezone for the user (e.g., America/Chicago). Defaults to UTC.';
