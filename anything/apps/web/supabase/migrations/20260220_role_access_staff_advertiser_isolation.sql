-- 20260220_role_access_staff_advertiser_isolation.sql
--
-- Goals:
-- 1) Admin/Manager can provision Staff and Advertiser accounts.
-- 2) Staff can create Ads + Invoices (and required Orders).
-- 3) Staff cannot see tenant-wide cash flow.
-- 4) Advertisers cannot see other advertisers' data.

create extension if not exists "pgcrypto";
-- -----------------------------------------------------------------------------
-- Profiles role constraint: Staff only (Assistant merged into Staff)
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles
set role = 'Staff'
where role = 'Assistant';
alter table public.profiles
add constraint profiles_role_check
check (role in ('Owner', 'Admin', 'Manager', 'Staff', 'Advertiser'));
-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (public.get_app_role() = 'Staff');
$$;
create or replace function public.is_assistant()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_staff();
$$;
create or replace function public.is_internal_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (public.get_app_role() in ('Owner', 'Admin', 'Manager', 'Staff'));
$$;
create or replace function public.same_tenant(row_tenant_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select (
    public.is_owner()
    or (public.is_internal_user() and row_tenant_id = public.get_app_tenant_id())
  );
$$;
-- -----------------------------------------------------------------------------
-- Tighten tenant visibility (remove global tenant read)
-- -----------------------------------------------------------------------------
drop policy if exists "View own tenant" on public.tenants;
drop policy if exists "Tenants View Policy" on public.tenants;
create policy "View own tenant" on public.tenants
for select using (
  public.is_owner()
  or id = public.get_app_tenant_id()
);
-- -----------------------------------------------------------------------------
-- Profiles: prevent advertiser tenant-wide profile read
-- -----------------------------------------------------------------------------
drop policy if exists "Profiles View Policy" on public.profiles;
create policy "Profiles View Policy" on public.profiles for select using (
  public.is_owner()
  or (public.is_internal_user() and public.get_app_tenant_id() = tenant_id)
  or (auth.uid() = id)
);
-- -----------------------------------------------------------------------------
-- Orders / Ads / Invoices: allow Staff create path
-- -----------------------------------------------------------------------------
drop policy if exists "Orders Insert Policy" on public.orders;
create policy "Orders Insert Policy" on public.orders for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager() or public.is_staff()))
);
drop policy if exists "Ads Insert Policy" on public.ads;
create policy "Ads Insert Policy" on public.ads for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager() or public.is_staff()))
);
drop policy if exists "Ads Update Policy" on public.ads;
create policy "Ads Update Policy" on public.ads for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
  or (public.is_staff() and created_by = auth.uid())
);
drop policy if exists "Invoices View Policy" on public.invoices;
create policy "Invoices View Policy" on public.invoices for select using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
  or (public.is_staff() and created_by = auth.uid())
  or public.is_my_advertiser_resource(advertiser_id)
);
drop policy if exists "Invoices Insert Policy" on public.invoices;
create policy "Invoices Insert Policy" on public.invoices for insert with check (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager() or public.is_staff()))
);
drop policy if exists "Invoices Update Policy" on public.invoices;
create policy "Invoices Update Policy" on public.invoices for update using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
  or (public.is_staff() and created_by = auth.uid())
);
-- Staff should not get full payments ledger visibility.
drop policy if exists "Payments View Policy" on public.payments;
create policy "Payments View Policy" on public.payments for select using (
  public.is_owner()
  or (public.same_tenant(tenant_id) and (public.is_admin() or public.is_manager()))
);
-- -----------------------------------------------------------------------------
-- Provisioning auth: Owner any role, Admin/Manager only Staff or Advertiser
-- -----------------------------------------------------------------------------
create or replace function public.provision_user(
    new_email text,
    new_password text,
    new_full_name text,
    new_role text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    new_user_id uuid;
    current_tenant_id uuid;
begin
    if not (
        public.is_owner()
        or (
            (public.is_admin() or public.is_manager())
            and new_role in ('Staff', 'Advertiser')
        )
    ) then
        raise exception 'Access Denied: Only Owners can provision internal users. Admin/Manager may provision Staff or Advertiser only.';
    end if;

    select tenant_id into current_tenant_id
    from public.profiles
    where id = auth.uid();

    if current_tenant_id is null then
        raise exception 'Provisioning Error: Operator has no tenant linked.';
    end if;

    insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    values (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        new_email,
        crypt(new_password, gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}',
        jsonb_build_object(
            'full_name', new_full_name,
            'role', new_role,
            'tenant_id', current_tenant_id
        ),
        false,
        now(),
        now(),
        '',
        '',
        '',
        ''
    )
    returning id into new_user_id;

    insert into auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    )
    values (
        new_user_id::text,
        new_user_id,
        jsonb_build_object(
            'sub', new_user_id::text,
            'email', new_email,
            'email_verified', true
        ),
        'email',
        now(),
        now(),
        now()
    )
    on conflict (provider_id, provider) do nothing;

    insert into public.profiles (
        id,
        tenant_id,
        role,
        full_name,
        email,
        created_at,
        updated_at
    )
    values (
        new_user_id,
        current_tenant_id,
        new_role,
        new_full_name,
        new_email,
        now(),
        now()
    )
    on conflict (id) do update set
        role = excluded.role,
        full_name = excluded.full_name,
        tenant_id = excluded.tenant_id,
        email = excluded.email,
        updated_at = now();

    return new_user_id;
end;
$$;
grant execute on function public.provision_user(text, text, text, text) to authenticated;
grant execute on function public.provision_user(text, text, text, text) to service_role;
