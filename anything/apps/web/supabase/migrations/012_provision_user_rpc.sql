-- 012_provision_user_rpc.sql
-- Goal: Allow 'Owner' to provision new users securely via RPC.

-- 1. Enable pgcrypto for password hashing if not already enabled
create extension if not exists "pgcrypto";
-- 2. Create the provision_user function
-- SECURITY DEFINER: Runs with privileges of the creator (postgres/superuser), bypassing RLS on auth.users
create or replace function public.provision_user(
    new_email text,
    new_password text,
    new_full_name text,
    new_role text
)
returns uuid
language plpgsql
security definer
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

    -- C. Insert into auth.users
    -- Note: We manually insert into the auth schema. This is a "Backdoor" approach often used when
    -- service_role client is not available interactively.
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
        updated_at
    )
    values (
        '00000000-0000-0000-0000-000000000000', -- Default instance_id
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        new_email,
        crypt(new_password, gen_salt('bf')), -- Hash password
        now(), -- Auto-confirm email for internal provisioning
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', new_full_name),
        false,
        now(),
        now()
    )
    returning id into new_user_id;

    -- D. Insert into public.profiles
    -- We must manually create the profile since we determined no trigger exists.
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
    );

    return new_user_id;
end;
$$;
