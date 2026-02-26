-- Migration: Add reminder functionality to ads table
-- Date: 2026-01-16

-- Add reminder_enabled column (boolean) - defaults to false
ALTER TABLE ads 
ADD COLUMN IF NOT EXISTS reminder_enabled boolean DEFAULT false;
-- Add reminder_minutes_before column (integer) - how many minutes before posting to send reminder
-- Common values: 15, 30, 60, 120, 1440 (1 day)
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS reminder_minutes_before integer DEFAULT 60;
-- Add reminder_sent_at timestamp - tracks when reminder was actually sent
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
-- Create index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_ads_reminder_pending 
ON ads(scheduled_date, scheduled_time, reminder_enabled) 
WHERE reminder_enabled = true AND reminder_sent_at IS NULL;
-- Add comment
COMMENT ON COLUMN ads.reminder_enabled IS 'Whether to send a reminder to the advertiser before posting';
COMMENT ON COLUMN ads.reminder_minutes_before IS 'How many minutes before posting to send the reminder';
COMMENT ON COLUMN ads.reminder_sent_at IS 'Timestamp when the reminder was sent';
