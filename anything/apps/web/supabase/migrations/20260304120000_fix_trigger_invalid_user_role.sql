-- Fix: handle_new_auth_user trigger used 'user' as the default role fallback,
-- but profiles.role has CHECK (role IN ('Owner','Admin','Manager','Assistant','Advertiser')).
-- 'user' is not a valid value → constraint violation → "Database error saving new user"
-- on every new Google OAuth signup.
--
-- Fix: fall back to 'Advertiser' (the only valid public-signup role) instead of 'user'.
-- The trigger already infers 'Advertiser' from pending_ads/advertisers tables;
-- this just makes the hard-coded fallback valid.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_tenant_id uuid;
    target_role text;
    normalized_email text;
    has_submit_ad_context boolean := false;
BEGIN
    normalized_email := lower(trim(coalesce(NEW.email, '')));
    target_role := nullif(trim(coalesce(NEW.raw_user_meta_data->>'role', '')), '');

    -- If no role is supplied in metadata, infer from submit-ad context
    IF target_role IS NULL AND normalized_email <> '' THEN
        IF to_regclass('public.cbnads_web_pending_ads') IS NOT NULL THEN
            EXECUTE $query$
                select exists (
                    select 1
                    from public.cbnads_web_pending_ads
                    where lower(trim(coalesce(email, ''))) = $1
                )
            $query$
            INTO has_submit_ad_context
            USING normalized_email;
        END IF;

        IF NOT has_submit_ad_context
           AND to_regclass('public.cbnads_web_advertisers') IS NOT NULL THEN
            EXECUTE $query$
                select exists (
                    select 1
                    from public.cbnads_web_advertisers
                    where lower(trim(coalesce(email, ''))) = $1
                )
            $query$
            INTO has_submit_ad_context
            USING normalized_email;
        END IF;

        IF has_submit_ad_context THEN
            target_role := 'Advertiser';
        END IF;
    END IF;

    -- Resolve tenant
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

    -- COALESCE fallback is now 'Advertiser' (valid) instead of 'user' (invalid)
    INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed User'),
        COALESCE(target_role, 'Advertiser'),
        target_tenant_id
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);

    RETURN NEW;
END;
$$;
