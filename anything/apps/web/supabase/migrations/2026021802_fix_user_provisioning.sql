-- 20260218_fix_user_provisioning.sql

-- Goal: Fix "Database error querying schema" by adding SET search_path to all
-- SECURITY DEFINER functions on auth.users triggers, and ensure tenant_id assignment.

-- =============================================================================
-- FIX 0: Add SET search_path to ALL auth.users trigger functions
-- Without this, Supabase GoTrue rejects SECURITY DEFINER triggers as a security risk.
-- =============================================================================

-- 0A. Fix handle_auth_user_sync (fires on auth.users email update)
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;
-- 0B. Fix handle_profile_update (fires on profiles update, writes to auth.users)
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'full_name', new.full_name,
      'role', new.role
    )
  WHERE id = new.id;
  RETURN new;
END;
$$;
-- 0C. Fix RLS helper functions (called during every authenticated query)
CREATE OR REPLACE FUNCTION public.get_app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.get_app_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;
-- 1. UPDATE TRIGGER: handle_new_auth_user
-- This trigger runs automatically when a user signs up or is created.
-- We enhance it to robustly find or create a tenant.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_tenant_id uuid;
BEGIN
    -- A. Try to get tenant_id from metadata (passed by provision_user invite)
    -- We cast to text first to handle potential JSON types safely, then to UUID
    target_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;

    -- B. Verify validity if provided
    IF target_tenant_id IS NOT NULL THEN
        PERFORM 1 FROM public.tenants WHERE id = target_tenant_id;
        IF NOT FOUND THEN
            target_tenant_id := NULL; -- Invalid ID provided, fallback
        END IF;
    END IF;

    -- C. Fallback: Use first available tenant (for self-signups)
    IF target_tenant_id IS NULL THEN
        SELECT id INTO target_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
    END IF;

    -- D. Critical Safety Net: If NO tenants exist, create one.
    -- This ensures the first ever user (or system recovery) never gets stuck.
    IF target_tenant_id IS NULL THEN
        INSERT INTO public.tenants (name) VALUES ('Default Organization')
        RETURNING id INTO target_tenant_id;
    END IF;

    -- E. Insert Profile with the guaranteed tenant_id
    INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
    VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'Manager'),
        target_tenant_id
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        -- Only set tenant_id if it's currently NULL to avoid overwriting existing valid links
        tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);

    RETURN NEW;
END;
$$;
-- 2. UPDATE RPC: provision_user
-- We update this to explicitly pass the admin's tenant_id in the user metadata.
-- This ensures the trigger above (Step A) picks the correct tenant immediately.

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
    -- A. Authorization Check
    -- Only 'Owner' can provision users.
    if not public.is_owner() then
        raise exception 'Access Denied: Only Owners can provision new users.';
    end if;

    -- B. Get Current Tenant
    select tenant_id into current_tenant_id
    from public.profiles
    where id = auth.uid();
    
    if current_tenant_id is null then
         raise exception 'Provisioning Error: Administrator/Owner has no tenant linked.';
    end if;

    -- C. Insert into auth.users WITH Tenant ID in metadata
    -- We include 'role' and 'tenant_id' in metadata so the trigger handles it perfectly.
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
        -- GoTrue requires these as empty strings, NOT NULL
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    values (
        '00000000-0000-0000-0000-000000000000', -- Default instance_id
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        new_email,
        crypt(new_password, gen_salt('bf')), -- Hash password
        now(), -- Auto-confirm email
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object(
            'full_name', new_full_name,
            'role', new_role,
            'tenant_id', current_tenant_id
        ),
        false,
        now(),
        now(),
        '', -- confirmation_token
        '', -- email_change
        '', -- email_change_token_new
        ''  -- recovery_token
    )
    returning id into new_user_id;

    -- Create auth.identities record (required by GoTrue for password login)
    insert into auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) values (
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

    -- D. Redundant Profile Upsert
    -- The trigger likely handled this, but we keep this as a deterministic safety guarantee.
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
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        tenant_id = EXCLUDED.tenant_id,
        email = EXCLUDED.email,
        updated_at = now();

    return new_user_id;
end;
$$;
grant execute on function public.provision_user(text, text, text, text) to authenticated;
grant execute on function public.provision_user(text, text, text, text) to service_role;
-- =============================================================================
-- 3. SAFETY BACKFILL: normalize existing auth users (created before this fix)
-- =============================================================================

update auth.users
set
    confirmation_token = coalesce(confirmation_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    recovery_token = coalesce(recovery_token, '')
where
    confirmation_token is null
    or email_change is null
    or email_change_token_new is null
    or recovery_token is null;
insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
select
    u.id::text,
    u.id,
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', (u.email_confirmed_at is not null)
    ),
    'email',
    now(),
    now(),
    now()
from auth.users u
where
    u.email is not null
    and (
        coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
        or coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'email'
    )
    and not exists (
        select 1
        from auth.identities i
        where i.provider = 'email'
          and i.user_id = u.id
    )
on conflict (provider_id, provider) do nothing;
