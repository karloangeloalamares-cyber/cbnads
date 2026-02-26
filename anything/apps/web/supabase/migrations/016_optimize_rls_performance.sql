-- Migration: Optimize RLS performance for ads table
                                                    -- Date: 2026-01-16
                                                    -- Issue: ads table taking 15+ seconds to fetch 6 records due to expensive RLS checks

                                                    -- 1. Add index on profiles table for faster RLS lookups
                                                    CREATE INDEX IF NOT EXISTS idx_profiles_advertiser_lookup 
                                                    ON public.profiles(id, role, advertiser_id) 
                                                    WHERE role = 'Advertiser';
-- 2. Add index on profiles for tenant lookups
                                                    CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id 
                                                    ON public.profiles(id, tenant_id);
-- 3. Add index on ads table for tenant lookups  
                                                    CREATE INDEX IF NOT EXISTS idx_ads_tenant_id
                                                    ON public.ads(tenant_id);
-- 4. Add index on ads for advertiser lookups
                                                    CREATE INDEX IF NOT EXISTS idx_ads_advertiser_id
                                                    ON public.ads(advertiser_id);
-- 5. Refresh the materialized RLS helper function to use a more efficient lookup
                                                    -- (Using a set-returning approach instead of EXISTS for each row)
                                                    CREATE OR REPLACE FUNCTION public.get_user_advertiser_id()
                                                    RETURNS uuid
                                                    LANGUAGE sql STABLE SECURITY DEFINER
                                                    AS $$
                                                    SELECT advertiser_id FROM public.profiles 
                                                    WHERE id = auth.uid() AND role = 'Advertiser'
                                                    LIMIT 1;
                                                    $$;
-- 6. Update the is_my_advertiser_resource function to be more efficient
                                                    CREATE OR REPLACE FUNCTION public.is_my_advertiser_resource(resource_advertiser_id uuid)
                                                    RETURNS boolean
                                                    LANGUAGE sql STABLE SECURITY DEFINER
                                                    AS $$
                                                    SELECT (public.get_user_advertiser_id() = resource_advertiser_id);
                                                    $$;
-- 7. ANALYZE tables to update statistics for query planner
                                                    ANALYZE public.profiles;
ANALYZE public.ads;
ANALYZE public.advertisers;
