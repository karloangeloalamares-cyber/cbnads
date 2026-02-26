-- 020_admin_user_management.sql
-- Goal: basic admin functions for User Management (Delete)

-- 1. Create delete_user function
-- SECURITY DEFINER: required to delete from auth.users
create or replace function public.delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
    -- A. Authorization Check
    -- Only 'Owner' can delete users.
    if not public.is_owner() then
        raise exception 'Access Denied: Only Owners can delete users.';
    end if;

    -- B. Prevent Self-Deletion
    if target_user_id = auth.uid() then
        raise exception 'Operation Failed: You cannot delete your own account via this interface.';
    end if;

    -- C. Delete from auth.users
    -- This triggers CASCADE delete on public.profiles due to FK constraint.
    delete from auth.users where id = target_user_id;
end;
$$;
