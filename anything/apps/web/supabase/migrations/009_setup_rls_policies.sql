-- =====================================================================================
-- SECTION A: Helper Functions (SECURITY DEFINER)
-- =====================================================================================

-- 1. Get current user's role (Renamed to avoid conflict with system function current_role)
create or replace function public.get_app_role()
returns text
language sql stable security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;
-- 2. Get current user's tenant_id
create or replace function public.get_app_tenant_id()
returns uuid
language sql stable security definer
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;
-- 3. Check if user is Owner (Platform Super Admin)
create or replace function public.is_owner()
returns boolean
language sql stable security definer
as $$
  select (public.get_app_role() = 'Owner');
$$;
-- 4. Check if user is Admin (Tenant Owner)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
as $$
  select (public.get_app_role() = 'Admin');
$$;
-- 5. Check if user is Manager (Staff)
create or replace function public.is_manager()
returns boolean
language sql stable security definer
as $$
  select (public.get_app_role() = 'Manager');
$$;
-- 6. Check if user is Assistant (View Only)
create or replace function public.is_assistant()
returns boolean
language sql stable security definer
as $$
  select (public.get_app_role() = 'Assistant');
$$;
-- 7. Check if user is Advertiser (Client)
create or replace function public.is_advertiser()
returns boolean
language sql stable security definer
as $$
  select (public.get_app_role() = 'Advertiser');
$$;
-- 8. Check if row belongs to same tenant
create or replace function public.same_tenant(row_tenant_id uuid)
returns boolean
language sql stable security definer
as $$
  select (
    public.is_owner() -- Owners bypass check
    or 
    (row_tenant_id = public.get_app_tenant_id())
  );
$$;
-- 9. Check if advertiser owns the resource (based on profiles.advertiser_id mapping)
create or replace function public.is_my_advertiser_resource(resource_advertiser_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'Advertiser'
    and advertiser_id = resource_advertiser_id
  );
$$;
-- =====================================================================================
-- SECTION C: RLS POLICIES (Grouped by Table)
-- =====================================================================================

-- 1. PROFILES
-- SELECT: Owner all. Admin/Manager/Assistant same tenant. Advertiser own only.
create policy "Profiles View Policy" on public.profiles for select using (
  public.is_owner()
  or (public.get_app_tenant_id() = tenant_id)
  or (auth.uid() = id)
);
-- UPDATE: Owner all. Admin/Manager/Assistant same tenant (safe fields only enforced in UI/Trigger usually, here we restrict row). Advertiser own only.
create policy "Profiles Update Policy" on public.profiles for update using (
  public.is_owner()
  or (public.get_app_tenant_id() = tenant_id and (public.is_admin() or public.is_manager()))
  or (auth.uid() = id)
);
-- INSERT: Owner only (Provisioning).
create policy "Profiles Insert Policy" on public.profiles for insert with check (
  public.is_owner()
);
-- 2. ADVERTISERS
-- SELECT: Owner all. Staff same tenant. Advertiser self only.
create policy "Advertisers View Policy" on public.advertisers for select using (
  public.same_tenant(tenant_id) -- Handles Owner & Staff
  or public.is_my_advertiser_resource(id)
);
-- INSERT: Owner or Admin/Manager (if desired).
create policy "Advertisers Insert Policy" on public.advertisers for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- UPDATE: Owner or Admin/Manager.
create policy "Advertisers Update Policy" on public.advertisers for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- DELETE: Owner or Admin only.
create policy "Advertisers Delete Policy" on public.advertisers for delete using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- 3. PRODUCTS
-- SELECT: Owner all. Staff same tenant.
create policy "Products View Policy" on public.products for select using (
  public.same_tenant(tenant_id)
);
-- INSERT: Owner or Admin.
create policy "Products Insert Policy" on public.products for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- UPDATE: Owner or Admin.
create policy "Products Update Policy" on public.products for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- DELETE: Owner or Admin.
create policy "Products Delete Policy" on public.products for delete using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- 4. ORDERS
-- SELECT: Owner all. Staff same tenant. Advertiser own orders.
create policy "Orders View Policy" on public.orders for select using (
  public.same_tenant(tenant_id)
  or public.is_my_advertiser_resource(advertiser_id)
);
-- INSERT: Owner or Admin/Manager.
create policy "Orders Insert Policy" on public.orders for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- UPDATE: Owner or Admin/Manager.
create policy "Orders Update Policy" on public.orders for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- DELETE: Owner or Admin.
create policy "Orders Delete Policy" on public.orders for delete using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- 5. ADS (and Assets/Deliverables)
-- SELECT: Owner all. Staff same tenant. Advertiser own ads.
create policy "Ads View Policy" on public.ads for select using (
  public.same_tenant(tenant_id)
  or public.is_my_advertiser_resource(advertiser_id)
);
-- INSERT: Owner or Admin/Manager.
create policy "Ads Insert Policy" on public.ads for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- UPDATE: Owner or Admin/Manager.
create policy "Ads Update Policy" on public.ads for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- DELETE: Owner or Admin.
create policy "Ads Delete Policy" on public.ads for delete using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- 6. INVOICES
-- SELECT: Owner all. Staff same tenant. Advertiser own.
create policy "Invoices View Policy" on public.invoices for select using (
  public.same_tenant(tenant_id)
  or public.is_my_advertiser_resource(advertiser_id)
);
-- INSERT: Owner or Admin/Manager.
create policy "Invoices Insert Policy" on public.invoices for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- UPDATE: Owner or Admin/Manager.
create policy "Invoices Update Policy" on public.invoices for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- DELETE: Owner or Admin.
create policy "Invoices Delete Policy" on public.invoices for delete using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and public.is_admin())
);
-- 7. AUDIT LOGS
-- SELECT: Owner all. Staff same tenant.
create policy "Audit View Policy" on public.audit_logs for select using (
  public.same_tenant(tenant_id)
);
-- INSERT: Owner/Admin/Manager.
create policy "Audit Insert Policy" on public.audit_logs for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- UPDATE/DELETE: None (Immutable).

-- 8. PAYMENTS
-- SELECT: Owner all. Staff same tenant.
create policy "Payments View Policy" on public.payments for select using (
  public.same_tenant(tenant_id)
);
-- INSERT/UPDATE: Owner/Admin/Manager.
create policy "Payments Write Policy" on public.payments for all using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
