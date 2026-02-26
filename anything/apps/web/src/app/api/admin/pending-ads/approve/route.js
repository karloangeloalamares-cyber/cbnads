import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const userRole = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (!userRole[0] || userRole[0].role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      pending_ad_id,
      use_existing_advertiser,
      existing_advertiser_id,
      force_inactive,
    } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    // Get pending ad details
    const pendingAd = await sql`
      SELECT * FROM pending_ads WHERE id = ${pending_ad_id}
    `;

    if (!pendingAd[0]) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    const ad = pendingAd[0];

    let advertiserId;
    let advertiserName;

    // Check if we should use existing advertiser or create new
    if (use_existing_advertiser && existing_advertiser_id) {
      advertiserId = existing_advertiser_id;
      // Get the advertiser details from the existing advertiser
      const existingAdvertiser = await sql`
        SELECT advertiser_name, status FROM advertisers WHERE id = ${existing_advertiser_id}
      `;

      if (!existingAdvertiser[0]) {
        return Response.json(
          { error: "Advertiser not found" },
          { status: 404 },
        );
      }

      advertiserName = existingAdvertiser[0].advertiser_name;

      // Check if advertiser is inactive and warn
      if (existingAdvertiser[0].status === "Inactive" && !force_inactive) {
        return Response.json(
          {
            warning: true,
            message: `Advertiser "${advertiserName}" is currently Inactive. The approved ad will be created as Draft status. Approve anyway?`,
            advertiserStatus: "Inactive",
          },
          { status: 200 },
        );
      }
    } else {
      // Create new advertiser
      const newAdvertiser = await sql`
        INSERT INTO advertisers (
          advertiser_name,
          contact_name,
          email,
          phone_number,
          status
        ) VALUES (
          ${ad.advertiser_name},
          ${ad.contact_name},
          ${ad.email},
          ${ad.phone_number || null},
          'active'
        )
        RETURNING id, advertiser_name
      `;
      advertiserId = newAdvertiser[0].id;
      advertiserName = newAdvertiser[0].advertiser_name;
    }

    // Determine status based on advertiser status
    let adStatus = "Scheduled";
    if (use_existing_advertiser && existing_advertiser_id) {
      const advertiserCheck = await sql`
        SELECT status FROM advertisers WHERE id = ${existing_advertiser_id}
      `;
      if (advertiserCheck[0]?.status === "Inactive") {
        adStatus = "Draft";
      }
    }

    // Create the ad
    const newAd = await sql`
      INSERT INTO ads (
        ad_name,
        advertiser,
        status,
        post_type,
        placement,
        payment,
        schedule,
        post_date_from,
        post_date_to,
        custom_dates,
        post_time,
        reminder_minutes,
        ad_text,
        media
      ) VALUES (
        ${ad.ad_name},
        ${advertiserName},
        ${adStatus},
        ${ad.post_type},
        ${ad.placement || "Standard"},
        'pending',
        ${ad.post_type === "One-Time Post" ? ad.post_date_from : null},
        ${ad.post_date_from || null},
        ${ad.post_date_to || null},
        ${ad.custom_dates ? JSON.stringify(ad.custom_dates) : null},
        ${ad.post_time || null},
        ${ad.reminder_minutes || 15},
        ${ad.ad_text || null},
        ${ad.media ? JSON.stringify(ad.media) : "[]"}
      )
      RETURNING *
    `;

    // Update the advertiser's next_ad_date
    await updateAdvertiserNextAdDate(advertiserName);

    // Delete the pending ad
    await sql`
      DELETE FROM pending_ads
      WHERE id = ${pending_ad_id}
    `;

    return Response.json({
      success: true,
      ad: newAd[0],
      advertiser_id: advertiserId,
    });
  } catch (error) {
    console.error("Error approving ad:", error);
    return Response.json(
      { error: `Failed to approve ad: ${error.message}` },
      { status: 500 },
    );
  }
}
