-- Migration to cascade Advertiser assignment changes to their Tasks

-- 1. Create function to handle the cascade
create or replace function public.cascade_advertiser_assignment()
returns trigger as $$
begin
  -- Only update if assigned_to has effectively changed
  if (OLD.assigned_to is distinct from NEW.assigned_to) then
    
    -- Update all OPEN tasks (pending, in_progress, review)
    -- We generally do not want to re-assign Completed or Cancelled tasks
    update public.tasks
    set assigned_to = NEW.assigned_to,
        updated_at = now()
    where advertiser_id = NEW.id
    and status not in ('completed', 'cancelled');
    
  end if;
  return NEW;
end;
$$ language plpgsql security definer;
-- 2. Create the trigger
drop trigger if exists on_advertiser_assignment_change on public.advertisers;
create trigger on_advertiser_assignment_change
after update on public.advertisers
for each row
execute procedure public.cascade_advertiser_assignment();
