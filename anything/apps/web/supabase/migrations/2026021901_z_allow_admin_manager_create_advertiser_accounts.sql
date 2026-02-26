-- 20260219_z_allow_admin_manager_create_advertiser_accounts.sql
--
-- Goal:
-- Allow Admin/Manager to provision Advertiser accounts, while keeping
-- non-Advertiser provisioning restricted to Owner.

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
    -- Authorization:
    -- - Owner can provision any role
    -- - Admin/Manager can provision Advertiser only
    if not (
        public.is_owner()
        or (
            (public.is_admin() or public.is_manager())
            and new_role = 'Advertiser'
        )
    ) then
        raise exception 'Access Denied: Only Owners can provision internal users. Admin/Manager may provision Advertiser accounts only.';
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
