-- Schedule automated reminder email delivery for ads.
-- Runs every 5 minutes and invokes the send-reminder-emails edge function.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
DECLARE
    existing_job_id BIGINT;
BEGIN
    SELECT jobid
    INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'send-ad-reminder-emails'
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(existing_job_id);
    END IF;
END $$;
SELECT cron.schedule(
    'send-ad-reminder-emails',
    '*/5 * * * *',
    $$
    SELECT net.http_post(
        url := COALESCE(current_setting('app.settings.supabase_url', true), '') || '/functions/v1/send-reminder-emails',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
        ),
        body := jsonb_build_object('source', 'pg_cron')
    );
    $$
);
