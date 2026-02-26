-- 042_manual_password_reset.sql
-- Goal: Allow authorized roles to manually reset user passwords via RPC.

create or replace function public.admin_reset_password(
    target_user_id uuid,
    new_password text
)
returns boolean
language plpgsql
security definer
as $$
begin
    -- Authorization Check: Only Owner, Admin, or Manager can reset passwords
    if not (public.is_owner() or public.is_admin() or public.is_manager()) then
        raise exception 'Access Denied: Only authorized roles can reset user passwords.';
    end if;

    -- Update auth.users encrypted_password
    update auth.users
    set encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    where id = target_user_id;

    return true;
end;
$$;
