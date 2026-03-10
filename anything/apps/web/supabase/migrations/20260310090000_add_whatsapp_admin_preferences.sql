-- Add WhatsApp recipient and channel settings storage for admin notification preferences.

alter table if exists public.cbnads_web_admin_notification_preferences
  add column if not exists whatsapp_recipients jsonb not null default '[]'::jsonb;

alter table if exists public.cbnads_web_admin_notification_preferences
  add column if not exists whatsapp_settings jsonb not null default '{}'::jsonb;

update public.cbnads_web_admin_notification_preferences
set whatsapp_recipients = '[]'::jsonb
where whatsapp_recipients is null;

update public.cbnads_web_admin_notification_preferences
set whatsapp_settings = '{}'::jsonb
where whatsapp_settings is null;
