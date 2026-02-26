-- 041_add_advertiser_address.sql
-- Add address column to advertisers table

alter table public.advertisers 
add column if not exists address text;
-- Add phone column (regular phone, separate from whatsapp) to advertisers table if missing
alter table public.advertisers 
add column if not exists phone text;
