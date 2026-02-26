-- 035_invoice_extras.sql
-- Add tax_rate, discount_amount, and notes columns to invoices table

-- Add tax_rate column (percentage, e.g., 10.00 for 10%)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 0.00 CHECK (tax_rate >= 0 AND tax_rate <= 100);
-- Add discount_amount column (flat amount discount)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS discount_amount numeric(10, 2) DEFAULT 0.00 CHECK (discount_amount >= 0);
-- Add notes column for invoice remarks/comments
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS notes text;
-- Add ad_id column to link invoice directly to an ad (for ad creation flow)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS ad_id uuid REFERENCES public.ads(id);
COMMENT ON COLUMN public.invoices.tax_rate IS 'Tax percentage (0-100)';
COMMENT ON COLUMN public.invoices.discount_amount IS 'Flat discount amount applied to invoice';
COMMENT ON COLUMN public.invoices.notes IS 'Additional notes or remarks for the invoice';
COMMENT ON COLUMN public.invoices.ad_id IS 'Direct link to the ad this invoice is for';
