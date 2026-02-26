-- Store ad schedule timezone so reminders trigger at the correct local wall-clock time.

ALTER TABLE public.ads
ADD COLUMN IF NOT EXISTS scheduled_timezone text;
-- Backfill from creator profile timezone when available.
UPDATE public.ads AS a
SET scheduled_timezone = p.timezone
FROM public.profiles AS p
WHERE (a.scheduled_timezone IS NULL OR btrim(a.scheduled_timezone) = '')
  AND p.id = a.created_by
  AND p.timezone IS NOT NULL
  AND btrim(p.timezone) <> '';
-- Backfill remaining rows from advertiser profile timezone.
WITH advertiser_timezones AS (
    SELECT
        advertiser_id,
        max(timezone) AS timezone
    FROM public.profiles
    WHERE role = 'Advertiser'
      AND advertiser_id IS NOT NULL
      AND timezone IS NOT NULL
      AND btrim(timezone) <> ''
    GROUP BY advertiser_id
)
UPDATE public.ads AS a
SET scheduled_timezone = atz.timezone
FROM advertiser_timezones AS atz
WHERE (a.scheduled_timezone IS NULL OR btrim(a.scheduled_timezone) = '')
  AND a.advertiser_id = atz.advertiser_id;
-- Final fallback for legacy rows.
UPDATE public.ads
SET scheduled_timezone = 'Asia/Manila'
WHERE scheduled_timezone IS NULL OR btrim(scheduled_timezone) = '';
ALTER TABLE public.ads
ALTER COLUMN scheduled_timezone SET DEFAULT 'Asia/Manila';
ALTER TABLE public.ads
ALTER COLUMN scheduled_timezone SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ads_scheduled_timezone
ON public.ads (scheduled_timezone);
