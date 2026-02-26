import sql from "@/app/api/utils/sql";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      ad_name,
      advertiser,
      status,
      post_type,
      placement,
      schedule,
      post_date_from,
      post_date_to,
      custom_dates,
      payment,
      product_id,
      media,
      ad_text,
      post_time,
      reminder_minutes,
      skip_duplicate_check,
    } = body;

    if (!ad_name || !advertiser || !post_type || !placement || !payment) {
      return Response.json(
        { error: "Required fields missing" },
        { status: 400 },
      );
    }

    // Check if advertiser is inactive
    const advertiserCheck = await sql`
      SELECT status FROM advertisers WHERE advertiser_name = ${advertiser}
    `;

    if (advertiserCheck[0]?.status === "Inactive") {
      return Response.json(
        {
          error: `Cannot create ad for inactive advertiser "${advertiser}". Please activate the advertiser first.`,
        },
        { status: 400 },
      );
    }

    // Check for duplicate ads (unless skipped)
    if (!skip_duplicate_check) {
      let duplicateQuery = `
        SELECT id, ad_name, status FROM ads
        WHERE advertiser = $1
        AND placement = $2
      `;
      const params = [advertiser, placement];
      let paramCount = 2;

      // Check based on post type
      if (post_type === "One-Time Post" && schedule) {
        paramCount++;
        duplicateQuery += ` AND schedule = $${paramCount}`;
        params.push(schedule);
      } else if (post_type === "Daily Run" && post_date_from) {
        paramCount++;
        duplicateQuery += ` AND post_date_from = $${paramCount}`;
        params.push(post_date_from);
      }

      duplicateQuery += ` LIMIT 1`;

      const duplicates = await sql(duplicateQuery, params);

      if (duplicates.length > 0) {
        const duplicate = duplicates[0];
        return Response.json(
          {
            warning: true,
            message: `Similar ad "${duplicate.ad_name}" already exists for ${advertiser} on this date and placement (Status: ${duplicate.status}). Create anyway?`,
            duplicateId: duplicate.id,
            duplicateName: duplicate.ad_name,
          },
          { status: 200 },
        );
      }
    }

    // Handle different post types
    let scheduleDate = null;
    let dateFrom = null;
    let dateTo = null;
    let customDatesJson = null;

    if (post_type === "One-Time Post") {
      // For one-time posts, save to BOTH schedule and post_date_from
      // This ensures the availability checker can find them
      scheduleDate = schedule || null;
      dateFrom = schedule || null; // Same date goes to both fields
    } else if (post_type === "Daily Run") {
      dateFrom = post_date_from || null;
      dateTo = post_date_to || null;
    } else if (post_type === "Custom Schedule") {
      customDatesJson =
        custom_dates && custom_dates.length > 0
          ? JSON.stringify(custom_dates)
          : null;
    }

    const result = await sql(
      `INSERT INTO ads (
        ad_name, 
        advertiser, 
        status, 
        post_type, 
        placement, 
        schedule, 
        post_date_from,
        post_date_to,
        custom_dates,
        payment, 
        product_id,
        media,
        ad_text,
        post_time,
        reminder_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *, post_time::TEXT as post_time`,
      [
        ad_name,
        advertiser,
        status || "Draft",
        post_type,
        placement,
        scheduleDate,
        dateFrom,
        dateTo,
        customDatesJson,
        payment,
        product_id || null,
        JSON.stringify(media || []),
        ad_text || null,
        post_time || null,
        reminder_minutes || 15,
      ],
    );

    // Update the advertiser's next_ad_date
    await updateAdvertiserNextAdDate(advertiser);

    return Response.json({ ad: result[0] });
  } catch (error) {
    console.error("Error creating ad:", error);
    return Response.json({ error: "Failed to create ad" }, { status: 500 });
  }
}
