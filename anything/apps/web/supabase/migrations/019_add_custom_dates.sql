-- 019_add_custom_dates_fixed.sql
-- Fixed corrupted migration to correctly add custom_dates support

-- 1. Add custom_dates column to ads table
-- Use jsonb for flexibility or date[] for strictness. 
-- In the front-end we use string arrays (YYYY-MM-DD), so text[] or date[] works.
-- We'll use date[] to match the database's date handling.

alter table public.ads 
add column if not exists custom_dates date[] default '{}';
-- 2. Add comment for documentation
comment on column public.ads.custom_dates is 'Array of specific dates for custom posting schedule, used when posting_type is custom';
