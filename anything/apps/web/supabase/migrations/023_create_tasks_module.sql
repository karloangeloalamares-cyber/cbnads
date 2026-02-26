-- Tasks Module: Operational Spine
-- Created: 2026-01-20
-- Purpose: Track work assignments from Ad creation -> Approval -> Invoice

-- Table: tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) not null,
  advertiser_id uuid references public.advertisers(id) not null,
  ad_id uuid references public.ads(id) on delete cascade,
  order_id uuid references public.orders(id),
  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  status text check (status in ('pending', 'in_progress', 'review', 'approved', 'cancelled')) default 'pending',
  priority text check (priority in ('low', 'medium', 'high')) default 'medium',
  due_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
-- Indexes
create index tasks_tenant_id_idx on public.tasks(tenant_id);
create index tasks_assigned_to_idx on public.tasks(assigned_to);
create index tasks_status_idx on public.tasks(status);
create index tasks_ad_id_idx on public.tasks(ad_id);
-- RLS Policies
alter table public.tasks enable row level security;
-- Admin/Manager: Full Access
create policy "Admin/Manager can view all tasks"
  on public.tasks for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.tenant_id = tasks.tenant_id
      and profiles.role in ('Owner', 'Admin', 'Manager')
    )
  );
create policy "Admin/Manager can insert tasks"
  on public.tasks for insert
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.tenant_id = tasks.tenant_id
      and profiles.role in ('Owner', 'Admin', 'Manager')
    )
  );
create policy "Admin/Manager can update tasks"
  on public.tasks for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.tenant_id = tasks.tenant_id
      and profiles.role in ('Owner', 'Admin', 'Manager')
    )
  );
-- Staff: View Own + Update Status
create policy "Staff can view assigned tasks"
  on public.tasks for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.tenant_id = tasks.tenant_id
      and profiles.role = 'Staff'
      and (tasks.assigned_to = auth.uid() or tasks.created_by = auth.uid())
    )
  );
create policy "Staff can update assigned task status"
  on public.tasks for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.tenant_id = tasks.tenant_id
      and profiles.role = 'Staff'
      and tasks.assigned_to = auth.uid()
    )
  );
-- Trigger: Auto-create task on Ad creation
create or replace function public.auto_create_task_for_ad()
returns trigger as $$
begin
  insert into public.tasks (
    tenant_id,
    advertiser_id,
    ad_id,
    order_id,
    created_by,
    status,
    priority,
    due_date
  ) values (
    NEW.tenant_id,
    NEW.advertiser_id,
    NEW.id,
    NEW.order_id,
    NEW.created_by,
    'pending',
    'medium',
    NEW.scheduled_date
  );
  return NEW;
end;
$$ language plpgsql security definer;
create trigger on_ad_created_auto_task
  after insert on public.ads
  for each row
  execute function public.auto_create_task_for_ad();
