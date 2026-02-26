-- 022_guard_posted_ads.sql
-- Goal: Prevent editing of Critical Content for ads that are already 'Posted' or 'Completed'.
-- We must allow: Status changes (Posted -> Completed) and Proof updates.

create or replace function public.prevent_posted_ad_updates()
returns trigger
language plpgsql
security definer
as $$
begin
    -- Check if the Ad is in a "Locked" state
    if OLD.status in ('Posted', 'Completed') then
        
        -- STRICTLY FORBID changing core creative/scheduling details
        if (NEW.text_caption is distinct from OLD.text_caption) or
           (NEW.media_urls is distinct from OLD.media_urls) or
           (NEW.scheduled_date is distinct from OLD.scheduled_date) or
           (NEW.scheduled_time is distinct from OLD.scheduled_time) or
           (NEW.product_id is distinct from OLD.product_id) or
           (NEW.advertiser_id is distinct from OLD.advertiser_id) or
           (NEW.placement is distinct from OLD.placement) or
           (NEW.media_sequence is distinct from OLD.media_sequence) then
            
            raise exception 'Operation Failed: Cannot edit content of an ad that has already been Posted. Only status updates and proof of posting are allowed.';
        end if;

    end if;

    return NEW;
end;
$$;
-- Create Trigger
drop trigger if exists guard_posted_ads_update on public.ads;
create trigger guard_posted_ads_update
    before update on public.ads
    for each row
    execute procedure public.prevent_posted_ad_updates();
