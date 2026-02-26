-- ONE-TIME REPAIR SCRIPT
-- Run this to fix missing tasks and sync assignments for existing data.

-- 1. Backfill missing tasks for active/scheduled Ads that don't have one yet
insert into public.tasks (
    tenant_id,
    advertiser_id,
    ad_id,
    order_id,
    created_by,
    assigned_to,
    status,
    priority,
    due_date,
    created_at,
    updated_at
)
select 
    distinct on (a.id)
    a.tenant_id,
    a.advertiser_id,
    a.id,
    a.order_id,
    a.created_by,
    coalesce(adv.assigned_to, a.created_by), -- Use Advertiser Manager if exists, else Creator
    'pending',
    'medium',
    a.scheduled_date,
    now(),
    now()
from public.ads a
left join public.advertisers adv on a.advertiser_id = adv.id
where not exists (
    select 1 from public.tasks t where t.ad_id = a.id
)
and a.status not in ('draft', 'archived');
-- 2. Force Sync: Update ALL open tasks to match their Advertiser's current Manager
update public.tasks t
set assigned_to = adv.assigned_to,
    updated_at = now()
from public.advertisers adv
where t.advertiser_id = adv.id
and adv.assigned_to is not null
and t.status not in ('completed', 'cancelled')
and (t.assigned_to is distinct from adv.assigned_to);
-- Only update if different;
