-- 20260220_zz_harden_delete_user_fk_cleanup.sql
--
-- Goal:
-- Make user deletion resilient by cleaning FK dependencies that point to the
-- profile row before deleting auth.users.

create or replace function public.delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    profile_ref record;
    fk_ref record;
    replacement_user_id uuid;
    qualified_table text;
    has_profile_ref boolean := false;
    can_reassign boolean;
begin
    -- Authorization: only Owner can delete users
    if not public.is_owner() then
        raise exception 'Access Denied: Only Owners can delete users.';
    end if;

    -- Prevent self-deletion from UI flow
    if target_user_id = auth.uid() then
        raise exception 'Operation Failed: You cannot delete your own account via this interface.';
    end if;

    -- Ensure target exists
    if not exists (select 1 from auth.users where id = target_user_id) then
        raise exception 'User Not Found: %', target_user_id;
    end if;

    replacement_user_id := auth.uid();

    -- Cleanup profile dependencies for every "profile-like" table that points to auth.users(id).
    -- This supports both public.profiles and prefixed variants such as cbn_app_profiles.
    for profile_ref in
        select
            con.conrelid as relid,
            ns.nspname as schema_name,
            cls.relname as table_name
        from pg_constraint con
        join pg_class cls on cls.oid = con.conrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        where con.contype = 'f'
          and con.confrelid = 'auth.users'::regclass
          and array_length(con.conkey, 1) = 1
          and att.attname = 'id'
          and cls.relkind = 'r'
    loop
        has_profile_ref := true;
        can_reassign := false;

        if replacement_user_id is not null then
            execute format(
                'select exists (select 1 from %I.%I where id = $1)',
                profile_ref.schema_name,
                profile_ref.table_name
            )
            into can_reassign
            using replacement_user_id;
        end if;

        -- Cleanup rows in tables that reference this profile table.
        -- Strategy:
        -- - Notifications/recipient-like refs: delete rows.
        -- - Nullable refs: set NULL.
        -- - Non-null refs: reassign to current operator (owner).
        for fk_ref in
            select
                con.conrelid as relid,
                ns.nspname as schema_name,
                cls.relname as table_name,
                att.attname as column_name,
                att.attnotnull as is_not_null
            from pg_constraint con
            join pg_class cls on cls.oid = con.conrelid
            join pg_namespace ns on ns.oid = cls.relnamespace
            join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
            where con.contype = 'f'
              and con.confrelid = profile_ref.relid
              and array_length(con.conkey, 1) = 1
              and cls.relkind = 'r'
        loop
            -- Skip the profile table itself; it is removed by auth.users cascade.
            if fk_ref.relid = profile_ref.relid then
                continue;
            end if;

            qualified_table := format('%I.%I', fk_ref.schema_name, fk_ref.table_name);

            if fk_ref.table_name ilike '%notification%'
               or fk_ref.column_name in ('recipient_id', 'receiver_id') then
                execute format(
                    'delete from %s where %I = $1',
                    qualified_table,
                    fk_ref.column_name
                ) using target_user_id;

            elsif fk_ref.is_not_null then
                if not can_reassign then
                    execute format(
                        'delete from %s where %I = $1',
                        qualified_table,
                        fk_ref.column_name
                    ) using target_user_id;
                else
                    execute format(
                        'update %s set %I = $1 where %I = $2',
                        qualified_table,
                        fk_ref.column_name,
                        fk_ref.column_name
                    ) using replacement_user_id, target_user_id;
                end if;

            else
                execute format(
                    'update %s set %I = null where %I = $1',
                    qualified_table,
                    fk_ref.column_name,
                    fk_ref.column_name
                ) using target_user_id;
            end if;
        end loop;
    end loop;

    if not has_profile_ref then
        raise exception 'Delete Failed: Could not resolve any profile table linked to auth.users.';
    end if;

    -- Delete auth user; profile row is removed by FK cascade.
    delete from auth.users where id = target_user_id;

    if not found then
        raise exception 'Delete Failed: Auth user % was not removed.', target_user_id;
    end if;
end;
$$;
grant execute on function public.delete_user(uuid) to authenticated;
grant execute on function public.delete_user(uuid) to service_role;
