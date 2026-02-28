-- Support Supabase-only persistence for profile and notification settings.

alter table if exists public.profiles
  add column if not exists whatsapp_number text;

comment on column public.profiles.whatsapp_number is
  'Optional WhatsApp contact number used by the ads manager profile settings.';

alter table if exists public.cbnads_web_admin_notification_preferences
  add column if not exists telegram_chat_ids jsonb not null default '[]'::jsonb;

update public.cbnads_web_admin_notification_preferences
set telegram_chat_ids = '[]'::jsonb
where telegram_chat_ids is null;
