import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// GET advertiser details with all ads
export async function GET(request, { params }) {
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

    const { id } = params;

    // Get advertiser info
    const advertiser = await sql`
      SELECT * FROM advertisers WHERE id = ${id}
    `;

    if (advertiser.length === 0) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    // Get all ads for this advertiser
    const ads = await sql`
      SELECT * FROM ads WHERE advertiser = ${advertiser[0].advertiser_name}
      ORDER BY created_at DESC
    `;

    return Response.json({
      advertiser: advertiser[0],
      ads,
    });
  } catch (error) {
    console.error("Error fetching advertiser details:", error);
    return Response.json(
      { error: "Failed to fetch advertiser details" },
      { status: 500 },
    );
  }
}

// PUT - Update advertiser
export async function PUT(request, { params }) {
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

    const { id } = params;
    const body = await request.json();
    const { advertiser_name, contact_name, email, phone_number, status } = body;

    // Get the old advertiser details before updating
    const oldAdvertiser = await sql`
      SELECT advertiser_name, status FROM advertisers WHERE id = ${id}
    `;

    if (oldAdvertiser.length === 0) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const oldName = oldAdvertiser[0].advertiser_name;
    const oldStatus = oldAdvertiser[0].status;

    // Update the advertiser
    const result = await sql`
      UPDATE advertisers
      SET
        advertiser_name = ${advertiser_name},
        contact_name = ${contact_name},
        email = ${email},
        phone_number = ${phone_number || null},
        status = ${status || "active"}
      WHERE id = ${id}
      RETURNING *
    `;

    // If advertiser name changed, cascade update to all related tables
    if (oldName !== advertiser_name) {
      // Update all ads with this advertiser
      await sql`
        UPDATE ads
        SET advertiser = ${advertiser_name}
        WHERE advertiser = ${oldName}
      `;

      // Update all pending ads with this advertiser
      await sql`
        UPDATE pending_ads
        SET advertiser_name = ${advertiser_name}
        WHERE advertiser_name = ${oldName}
      `;

      // Update all invoices with this advertiser
      await sql`
        UPDATE invoices
        SET advertiser_name = ${advertiser_name}
        WHERE advertiser_name = ${oldName}
      `;
    }

    // If advertiser status changed to Inactive, update all future non-published ads to Draft
    if (status === "Inactive" && oldStatus !== "Inactive") {
      const updatedAds = await sql`
        UPDATE ads
        SET status = 'Draft'
        WHERE advertiser = ${advertiser_name}
        AND status != 'Published'
        AND (
          schedule >= CURRENT_DATE
          OR post_date_from >= CURRENT_DATE
          OR (custom_dates IS NOT NULL AND custom_dates::jsonb != 'null'::jsonb)
        )
        RETURNING id, ad_name
      `;

      console.log(
        `Set ${updatedAds.length} future ads to Draft for inactive advertiser: ${advertiser_name}`,
      );
    }

    return Response.json({ advertiser: result[0] });
  } catch (error) {
    console.error("Error updating advertiser:", error);
    return Response.json(
      { error: "Failed to update advertiser" },
      { status: 500 },
    );
  }
}

// DELETE - Delete advertiser and all associated data
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin by querying the database
    const userRole = await sql`
      SELECT role FROM auth_users WHERE id = ${session.user.id}
    `;

    if (!userRole[0] || userRole[0].role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = params;

    // Get advertiser name first
    const advertiser = await sql`
      SELECT advertiser_name FROM advertisers WHERE id = ${id}
    `;

    if (advertiser.length === 0) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const advertiserName = advertiser[0].advertiser_name;

    // Delete in order: reminders -> ads -> advertiser
    // First delete all reminders associated with this advertiser's ads
    await sql`
      DELETE FROM sent_reminders
      WHERE ad_id IN (
        SELECT id FROM ads WHERE advertiser = ${advertiserName}
      )
    `;

    // Delete all ads for this advertiser
    await sql`
      DELETE FROM ads WHERE advertiser = ${advertiserName}
    `;

    // Delete the advertiser
    await sql`
      DELETE FROM advertisers WHERE id = ${id}
    `;

    return Response.json({
      success: true,
      message: "Advertiser and all associated data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting advertiser:", error);
    return Response.json(
      { error: "Failed to delete advertiser" },
      { status: 500 },
    );
  }
}
