-- Add Stripe tracking columns to Invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
-- Add Stripe Customer ID to Advertisers
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
-- Index for faster lookups during webhooks
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_session_id ON invoices(stripe_session_id);
