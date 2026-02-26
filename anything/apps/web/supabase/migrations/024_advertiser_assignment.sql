-- 024_advertiser_assignment.sql

-- 1. Add assigned_to column to advertisers
alter table public.advertisers 
add column if not exists assigned_to uuid references public.profiles(id);
create index if not exists advertisers_assigned_to_idx on public.advertisers(assigned_to);
-- 2. Update auto-creation trigger to use Advertiser's assignee
create or replace function public.auto_create_task_for_ad()
returns trigger as $$
declare
  default_assignee uuid;
begin
  -- Fetch the assignee from the advertiser
  select assigned_to into default_assignee
  from public.advertisers
  where id = NEW.advertiser_id;

  -- Default to created_by if no account manager assigned
  if default_assignee is null then
    default_assignee := NEW.created_by;
  end if;

  insert into public.tasks (
    tenant_id,
    advertiser_id,
    ad_id,
    order_id,
    created_by,
    assigned_to, -- Set the assignee
    status,
    priority,
    due_date
  ) values (
    NEW.tenant_id,
    NEW.advertiser_id,
    NEW.id,
    NEW.order_id,
    NEW.created_by,
    default_assignee,
    'pending',
    'medium',
    NEW.scheduled_date
  );
  return NEW;
end;
$$ language plpgsql security definer;
