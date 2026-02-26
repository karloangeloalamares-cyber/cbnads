-- 20260219_harden_provision_user_auth_records.sql
--
-- Goal:
-- 1) Ensure provision_user creates auth rows compatible with GoTrue password login.
-- 2) Backfill older rows that were created with NULL token fields.
-- 3) Ensure each email/password user has an auth.identities record.

create extension if not exists "pgcrypto";
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
    if not public.is_owner() then
        raise exception 'Access Denied: Only Owners can provision new users.';
    end if;

    select tenant_id into current_tenant_id
    from public.profiles
    where id = auth.uid();

    if current_tenant_id is null then
        raise exception 'Provisioning Error: Administrator/Owner has no tenant linked.';
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
