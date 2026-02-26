-- 20260218_fix_password_reset_rpc.sql

-- Goal: Fix "FAILED TO RESET PASSWORD" error by ensuring correct search_path and permissions.

-- 1. Ensure pgcrypto is available (required for crypt/gen_salt)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- 2. Re-create the function with SECURITY DEFINER and SEARCH_PATH
-- This prevents issues where 'crypt' is not found if it's in the extensions schema
CREATE OR REPLACE FUNCTION public.admin_reset_password(
    target_user_id uuid,
    new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions -- CRITICAL FIX: Ensure visibility of pgcrypto functions
AS $$
BEGIN
    -- Authorization Check: Only Owner, Admin, or Manager can reset passwords
    IF NOT (public.is_owner() OR public.is_admin() OR public.is_manager()) THEN
        RAISE EXCEPTION 'Access Denied: Only authorized roles can reset user passwords.';
    END IF;

    -- Update auth.users encrypted_password
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = target_user_id;

    RETURN true;
END;
$$;
-- 3. Explicitly Grant Execute Permissions
-- While public functions are usually executable, explicit grant avoids ambiguity.
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO service_role;
