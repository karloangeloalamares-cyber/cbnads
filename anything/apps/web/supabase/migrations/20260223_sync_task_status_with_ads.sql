-- Keep tasks aligned with ad lifecycle status.
-- Posted/Completed ads should not remain pending tasks.

create or replace function public.sync_task_status_with_ad_status()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.status is distinct from OLD.status then
    if NEW.status in ('Posted', 'Completed') then
      update public.tasks
      set
        status = 'approved',
        updated_at = timezone('utc'::text, now())
      where ad_id = NEW.id
        and status not in ('approved', 'cancelled');
    elsif NEW.status in ('Cancelled', 'Missed') then
      update public.tasks
      set
        status = 'cancelled',
        updated_at = timezone('utc'::text, now())
      where ad_id = NEW.id
        and status <> 'cancelled';
    end if;
  end if;

  return NEW;
end;
$$;
drop trigger if exists on_ad_status_sync_task on public.ads;
create trigger on_ad_status_sync_task
  after update of status on public.ads
  for each row
  execute function public.sync_task_status_with_ad_status();
-- Backfill existing tasks that are stale.
update public.tasks t
set
  status = case
    when a.status in ('Posted', 'Completed') then 'approved'
    when a.status in ('Cancelled', 'Missed') then 'cancelled'
    else t.status
  end,
  updated_at = timezone('utc'::text, now())
from public.ads a
where a.id = t.ad_id
  and (
    (a.status in ('Posted', 'Completed') and t.status not in ('approved', 'cancelled'))
    or
    (a.status in ('Cancelled', 'Missed') and t.status <> 'cancelled')
  );
-- Fix assignment cascade to ignore closed tasks.
create or replace function public.cascade_advertiser_assignment()
returns trigger as $$
begin
  if (OLD.assigned_to is distinct from NEW.assigned_to) then
    update public.tasks
    set assigned_to = NEW.assigned_to,
        updated_at = now()
    where advertiser_id = NEW.id
      and status not in ('approved', 'cancelled');
  end if;
  return NEW;
end;
$$ language plpgsql security definer;
