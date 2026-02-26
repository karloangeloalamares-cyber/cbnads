-- Add onboarding_complete flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;
-- Set existing users (non-advertisers) as already onboarded
UPDATE profiles SET onboarding_complete = TRUE WHERE role != 'Advertiser';
-- Comment
COMMENT ON COLUMN profiles.onboarding_complete IS 'Tracks whether advertiser has completed initial password setup';
