-- 031_sync_auth_emails.sql
-- Goal: Fix "No email" in Team list and ensure long-term sync.

-- 1. Repair: Update existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');
-- 2. Function: Sync changes from auth.users to public.profiles
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET email = NEW.email,
        updated_at = now()
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;
-- 3. Trigger: Listen for email updates in auth.users
DROP TRIGGER IF EXISTS on_auth_user_sync_email ON auth.users;
CREATE TRIGGER on_auth_user_sync_email
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_sync();
-- 4. Safety: Ensure new signups also get their email synced (complementary to existing triggers)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
    VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'Manager'),
        (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1) -- Default to first tenant
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user();
