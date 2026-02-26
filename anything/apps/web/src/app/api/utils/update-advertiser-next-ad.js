import { adDatesForDayCheck, dateOnly, db, table } from "@/app/api/utils/supabase-db";

/**
 * Updates an advertiser's `next_ad_date` from their upcoming non-published ads.
 * @param {string} advertiserName
 * @returns {Promise<string|null>}
 */
export async function updateAdvertiserNextAdDate(advertiserName) {
  if (!advertiserName) return null;

  const supabase = db();
  const today = dateOnly(new Date());

  const { data: ads, error: adsError } = await supabase
    .from(table("ads"))
    .select("status, schedule, post_type, post_date_from, post_date_to, custom_dates, advertiser")
    .eq("advertiser", advertiserName);

  if (adsError) {
    throw adsError;
  }

  const candidates = (ads || [])
    .filter((ad) => String(ad?.status || "").toLowerCase() !== "published")
    .flatMap((ad) => adDatesForDayCheck(ad))
    .filter((value) => value && value >= today)
    .sort();

  const nextAdDate = candidates.length > 0 ? candidates[0] : null;

  const { error: updateError } = await supabase
    .from(table("advertisers"))
    .update({
      next_ad_date: nextAdDate,
      updated_at: new Date().toISOString(),
    })
    .eq("advertiser_name", advertiserName);

  if (updateError) {
    throw updateError;
  }

  return nextAdDate;
}
