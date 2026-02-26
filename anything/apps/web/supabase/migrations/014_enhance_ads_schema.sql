-- 014_enhance_ads_schema.sql
-- Supports new Ad Intake Form requirements

-- 1. Add new columns to 'ads' table
alter table public.ads 
add column if not exists title text,
add column if not exists posting_type text check (posting_type in ('one_time', 'daily', 'custom')) default 'one_time',
add column if not exists end_date date, -- For ranges
add column if not exists budget_amount numeric default 0;
-- Snapshot of price at booking time

-- 2. Backfill existing records to have a title (fallback to caption stub)
update public.ads 
set title = coalesce(substring(text_caption from 1 for 30) || '...', 'Untitled Ad')
where title is null;
-- 3. Ensure RLS policies cover updates to these new columns (existing policies usually cover all columns, but good to verify)
-- (No specific RLS change needed if policies are "for all using ...");
