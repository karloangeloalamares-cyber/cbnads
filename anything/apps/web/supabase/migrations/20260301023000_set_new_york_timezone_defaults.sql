-- Standardize the ads manager to New York / Eastern Time.

alter table if exists public.profiles
  alter column timezone set default 'America/New_York';

update public.profiles
set timezone = 'America/New_York'
where timezone is null
   or btrim(timezone) = ''
   or timezone in ('UTC', 'EST', 'EDT', 'Asia/Manila');

alter table if exists public.cbnads_web_ads
  add column if not exists scheduled_timezone text;

update public.cbnads_web_ads
set scheduled_timezone = 'America/New_York'
where scheduled_timezone is null
   or btrim(scheduled_timezone) = ''
   or scheduled_timezone in ('UTC', 'EST', 'EDT', 'Asia/Manila');

alter table if exists public.cbnads_web_ads
  alter column scheduled_timezone set default 'America/New_York';

alter table if exists public.cbnads_web_ads
  alter column scheduled_timezone set not null;

alter table if exists public.ads
  add column if not exists scheduled_timezone text;

update public.ads
set scheduled_timezone = 'America/New_York'
where scheduled_timezone is null
   or btrim(scheduled_timezone) = ''
   or scheduled_timezone in ('UTC', 'EST', 'EDT', 'Asia/Manila');

alter table if exists public.ads
  alter column scheduled_timezone set default 'America/New_York';

alter table if exists public.ads
  alter column scheduled_timezone set not null;
