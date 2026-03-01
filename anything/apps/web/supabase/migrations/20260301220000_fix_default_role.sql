-- Fix critical security bug where new authentication users default to 'Manager'.
-- Replace the 'Manager' fallback with 'user', limiting their access until verified or promoted.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_tenant_id uuid;
BEGIN
    -- Try to get tenant_id from metadata
    target_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;

    IF target_tenant_id IS NOT NULL THEN
        PERFORM 1 FROM public.tenants WHERE id = target_tenant_id;
        IF NOT FOUND THEN
            target_tenant_id := NULL;
        END IF;
    END IF;

    IF target_tenant_id IS NULL THEN
        SELECT id INTO target_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
    END IF;

    IF target_tenant_id IS NULL THEN
        INSERT INTO public.tenants (name) VALUES ('Default Organization')
        RETURNING id INTO target_tenant_id;
    END IF;

    -- ONLY CHANGE IS THE DEFAULT ROLE: 'Manager' -> 'user'
    INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
    VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user'), 
        target_tenant_id
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);

    RETURN NEW;
END;
$$;
