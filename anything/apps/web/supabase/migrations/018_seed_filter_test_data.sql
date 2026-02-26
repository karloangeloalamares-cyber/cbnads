-- Seed data to test Ad filter buttons
-- Run this in Supabase SQL Editor
-- Tests: ACTIVE/ARCHIVED tabs, SCHEDULED/ACTIVE/ENDING SOON/ENDED filters

-- First, get your IDs:
-- SELECT id FROM tenants LIMIT 1;
-- SELECT id FROM advertisers LIMIT 1;
-- SELECT id FROM orders LIMIT 1;  
-- SELECT id FROM products LIMIT 1;

-- Then run these INSERT statements with the actual IDs:

DO $$
DECLARE
    v_tenant_id uuid;
    v_advertiser_id uuid;
    v_order_id uuid;
    v_product_id uuid;
BEGIN
    -- Get existing IDs
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    SELECT id INTO v_advertiser_id FROM advertisers LIMIT 1;
    SELECT id INTO v_order_id FROM orders LIMIT 1;
    SELECT id INTO v_product_id FROM products LIMIT 1;

    -- 1. SCHEDULED Ad (future date)
    INSERT INTO public.ads (tenant_id, advertiser_id, order_id, product_id, title, text_caption, placement, status, scheduled_date, end_date, scheduled_time, created_at, updated_at)
    VALUES (v_tenant_id, v_advertiser_id, v_order_id, v_product_id, 
        'Scheduled - Summer Sale 2026', 
        'Get ready for our BIGGEST SALE! 🌞', 
        'WhatsApp', 
        'Scheduled', 
        '2026-02-15',
        '2026-02-28',
        '09:00', 
        NOW(), NOW());

    -- 2. ACTIVE Ad (posted today)
    INSERT INTO public.ads (tenant_id, advertiser_id, order_id, product_id, title, text_caption, placement, status, scheduled_date, end_date, scheduled_time, posted_at, created_at, updated_at)
    VALUES (v_tenant_id, v_advertiser_id, v_order_id, v_product_id,
        'LIVE NOW - Flash Sale!',
        '⚡ Flash sale happening NOW! ⚡',
        'WhatsApp',
        'Posted',
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '7 days',
        '10:00',
        NOW(),
        NOW(), NOW());

    -- 3. ENDING SOON Ad (ends in 2 days)
    INSERT INTO public.ads (tenant_id, advertiser_id, order_id, product_id, title, text_caption, placement, status, scheduled_date, end_date, scheduled_time, posted_at, created_at, updated_at)
    VALUES (v_tenant_id, v_advertiser_id, v_order_id, v_product_id,
        'Last Chance - Weekend Promo!',
        '⏰ Only 2 days left! Dont miss out!',
        'WhatsApp',
        'Posted',
        CURRENT_DATE - INTERVAL '5 days',
        CURRENT_DATE + INTERVAL '2 days',
        '09:00',
        CURRENT_DATE - INTERVAL '5 days',
        NOW(), NOW());

    -- 4. ENDED Ad (completed)
    INSERT INTO public.ads (tenant_id, advertiser_id, order_id, product_id, title, text_caption, placement, status, scheduled_date, end_date, scheduled_time, posted_at, created_at, updated_at)
    VALUES (v_tenant_id, v_advertiser_id, v_order_id, v_product_id,
        'Completed - New Year Campaign',
        '🎆 Happy New Year! Campaign has ended.',
        'WhatsApp',
        'Completed',
        '2026-01-01',
        '2026-01-07',
        '00:00',
        '2026-01-01',
        NOW(), NOW());

    -- 5. ARCHIVED Ad (cancelled)
    INSERT INTO public.ads (tenant_id, advertiser_id, order_id, product_id, title, text_caption, placement, status, scheduled_date, end_date, scheduled_time, created_at, updated_at)
    VALUES (v_tenant_id, v_advertiser_id, v_order_id, v_product_id,
        'ARCHIVED - Old Holiday Campaign',
        'This campaign was cancelled.',
        'WhatsApp',
        'Cancelled',
        '2025-12-25',
        '2025-12-31',
        '10:00',
        NOW(), NOW());

    RAISE NOTICE 'Created 5 test ads with various statuses!';
END $$;
-- Verify
SELECT title, status, scheduled_date, end_date 
FROM ads 
ORDER BY created_at DESC 
LIMIT 10;
