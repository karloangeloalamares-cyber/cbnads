-- 011_update_ads_approvals.sql

-- 1. Update ADS table status constraint
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_status_check;
ALTER TABLE public.ads 
ADD CONSTRAINT ads_status_check 
CHECK (status IN (
  'Draft', 
  'Pending Approval', 
  'Changes Requested', 
  'Approved', 
  'Scheduled', 
  'Due', -- Legacy support
  'Posted', 
  'Completed', 
  'Missed', 
  'Cancelled'
));
-- 2. Create AD_APPROVALS table
CREATE TABLE public.ad_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid REFERENCES public.ads(id) NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) NOT NULL, -- Who performed action
  status text NOT NULL CHECK (status IN ('Approved', 'Changes Requested')),
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- 3. Enable RLS
ALTER TABLE public.ad_approvals ENABLE ROW LEVEL SECURITY;
-- 4. RLS Policies for AD_APPROVALS

-- View: Staff can see approvals for same tenant. Advertisers can see for their own ads.
CREATE POLICY "Approvals View Policy" ON public.ad_approvals FOR SELECT USING (
  exists (
    select 1 from public.ads
    where ads.id = ad_approvals.ad_id
    and (
      public.same_tenant(ads.tenant_id)
      or public.is_my_advertiser_resource(ads.advertiser_id)
    )
  )
);
-- Insert: Staff and Advertisers can create approval records (if they own the ad/tenant)
CREATE POLICY "Approvals Insert Policy" ON public.ad_approvals FOR INSERT WITH CHECK (
  exists (
    select 1 from public.ads
    where ads.id = ad_id
    and (
      public.same_tenant(ads.tenant_id)
      or public.is_my_advertiser_resource(ads.advertiser_id)
    )
  )
);
