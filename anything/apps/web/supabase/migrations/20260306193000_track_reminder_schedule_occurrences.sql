alter table if exists public.cbnads_web_sent_reminders
  add column if not exists schedule_key text;

create index if not exists idx_cbnads_web_sent_reminders_schedule_key
  on public.cbnads_web_sent_reminders(schedule_key);

create unique index if not exists idx_cbnads_web_sent_reminders_occurrence
  on public.cbnads_web_sent_reminders(ad_id, recipient_type, schedule_key)
  where schedule_key is not null;
