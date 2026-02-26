-- 034_robust_invoices.sql

-- 1. Fix stale data: Rename existing 'INV-' prefixes to 'CBN-'
-- This ensures historical consistency with the new naming convention.
UPDATE public.invoices
SET invoice_number = REPLACE(invoice_number, 'INV-', 'CBN-')
WHERE invoice_number LIKE 'INV-%';
-- 2. Create a sequence for robust, sequential numbering
-- We start at 1001 to ensure a professional appearing start number and avoid low-digit collisions.
CREATE SEQUENCE IF NOT EXISTS public.seq_invoice_numbers START 1001;
-- 3. Create the function to auto-assign the number
CREATE OR REPLACE FUNCTION public.fn_auto_generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix text;
    seq_num int8;
BEGIN
    -- Only generate if invoice_number is NULL, empty, or literally 'Auto'
    IF NEW.invoice_number IS NULL OR TRIM(NEW.invoice_number) = '' OR NEW.invoice_number = 'Auto' THEN
        year_prefix := to_char(NEW.created_at, 'YYYY'); -- Use the record's creation date
        IF year_prefix IS NULL THEN
            year_prefix := to_char(now(), 'YYYY');
        END IF;
        
        seq_num := nextval('public.seq_invoice_numbers');
        
        -- Format: CBN-2026-001001 (6 digit sequence for scale up to 999,999)
        NEW.invoice_number := 'CBN-' || year_prefix || '-' || lpad(seq_num::text, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- 4. Create the Trigger
DROP TRIGGER IF EXISTS tr_auto_invoice_number ON public.invoices;
CREATE TRIGGER tr_auto_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_generate_invoice_number();
