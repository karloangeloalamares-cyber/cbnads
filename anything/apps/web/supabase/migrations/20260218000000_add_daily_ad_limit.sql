-- Add daily_ad_limit column to tenants table
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS daily_ad_limit INTEGER DEFAULT 5;
-- Add comment
COMMENT ON COLUMN tenants.daily_ad_limit IS 'Maximum number of ads allowed per day for this tenant';
