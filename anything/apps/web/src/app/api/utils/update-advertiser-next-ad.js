import sql from "../utils/sql";

/**
 * Updates an advertiser's next_ad_date based on their scheduled ads
 * @param {string} advertiserName - The advertiser name to update
 * @returns {Promise<Date|null>} The new next_ad_date value
 */
export async function updateAdvertiserNextAdDate(advertiserName) {
  if (!advertiserName) {
    console.log("No advertiser name provided to updateAdvertiserNextAdDate");
    return null;
  }

  try {
    // Find the next upcoming ad date across all post types
    const result = await sql`
      SELECT MIN(next_date) as next_ad_date
      FROM (
        -- One-time posts
        SELECT schedule as next_date
        FROM ads
        WHERE advertiser = ${advertiserName}
          AND post_type = 'One-Time Post'
          AND schedule IS NOT NULL
          AND schedule >= CURRENT_DATE
          AND status != 'Published'
        
        UNION ALL
        
        -- Daily runs (use start date)
        SELECT post_date_from as next_date
        FROM ads
        WHERE advertiser = ${advertiserName}
          AND post_type = 'Daily Run'
          AND post_date_from IS NOT NULL
          AND post_date_from >= CURRENT_DATE
          AND status != 'Published'
        
        UNION ALL
        
        -- Custom schedules (find earliest future date in the array)
        SELECT MIN((date_val::text)::date) as next_date
        FROM ads,
        jsonb_array_elements_text(custom_dates) as date_val
        WHERE advertiser = ${advertiserName}
          AND post_type = 'Custom Schedule'
          AND custom_dates IS NOT NULL
          AND (date_val::text)::date >= CURRENT_DATE
          AND status != 'Published'
      ) all_dates
      WHERE next_date IS NOT NULL
    `;

    const nextAdDate = result[0]?.next_ad_date || null;
    console.log("Next ad date for advertiser:", { advertiserName, nextAdDate });

    // Update the advertiser's next_ad_date
    const updateResult = await sql`
      UPDATE advertisers
      SET next_ad_date = ${nextAdDate}
      WHERE advertiser_name = ${advertiserName}
    `;

    console.log("Advertiser update result:", {
      advertiserName,
      rowsAffected: updateResult.length,
    });

    return nextAdDate;
  } catch (error) {
    console.error("Error in updateAdvertiserNextAdDate:", {
      advertiserName,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}
