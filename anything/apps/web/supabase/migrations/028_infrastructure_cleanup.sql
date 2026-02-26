-- 028_infrastructure_cleanup.sql

-- 1. Tenants RLS Policies
-- Owners can see all tenants. Admin/Staff can see only their own tenant.
drop policy if exists "Tenants View Policy" on public.tenants;
create policy "Tenants View Policy" on public.tenants for select using (
  public.is_owner()
  or id = public.get_app_tenant_id()
);
-- Owners only for insert/update/delete
drop policy if exists "Tenants Write Policy" on public.tenants;
create policy "Tenants Write Policy" on public.tenants for all using (
  public.is_owner()
);
-- 2. Audit Tasks table
drop trigger if exists audit_tasks_trigger on public.tasks;
create trigger audit_tasks_trigger
after insert or update or delete
on public.tasks
for each row
execute function public.log_entity_action();
-- 3. Invoices: Ensure Advertiser can see invoices
-- This was already in 009, but let's re-verify the Advertiser resource check.
-- public.is_my_advertiser_resource(advertiser_id)

-- 4. Secure the audit_logs table more strictly
-- Only Owners/Admins/Managers should ever see audit logs.
drop policy if exists "Audit View Policy" on public.audit_logs;
create policy "Audit View Policy" on public.audit_logs for select using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- 5. Helper function for front-end to check if an entity has logs
create or replace function public.get_audit_history(p_entity_type text, p_entity_id uuid)
returns setof public.audit_logs
language sql
stable
security invoker -- Use policies
as $$
  select * from public.audit_logs
  where entity_type = p_entity_type
  and entity_id = p_entity_id
  order by created_at desc;
$$;
