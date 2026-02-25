import sql from "../../../utils/sql";
import { auth } from "../../../../../auth";

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

    const {
      advertiser_name,
      contact_name,
      email,
      phone_number,
      ad_name,
      post_type,
      post_date_from,
      post_date_to,
      custom_dates,
      post_time,
      reminder_minutes,
      ad_text,
      placement,
      notes,
    } = body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (advertiser_name !== undefined) {
      updates.push(`advertiser_name = $${paramCount++}`);
      values.push(advertiser_name);
    }
    if (contact_name !== undefined) {
      updates.push(`contact_name = $${paramCount++}`);
      values.push(contact_name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phone_number !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number || null);
    }
    if (ad_name !== undefined) {
      updates.push(`ad_name = $${paramCount++}`);
      values.push(ad_name);
    }
    if (post_type !== undefined) {
      updates.push(`post_type = $${paramCount++}`);
      values.push(post_type);
    }
    if (post_date_from !== undefined) {
      updates.push(`post_date_from = $${paramCount++}`);
      values.push(post_date_from || null);
    }
    if (post_date_to !== undefined) {
      updates.push(`post_date_to = $${paramCount++}`);
      values.push(post_date_to || null);
    }
    if (custom_dates !== undefined) {
      updates.push(`custom_dates = $${paramCount++}`);
      values.push(JSON.stringify(custom_dates));
    }
    if (post_time !== undefined) {
      updates.push(`post_time = $${paramCount++}`);
      values.push(post_time || null);
    }
    if (reminder_minutes !== undefined) {
      updates.push(`reminder_minutes = $${paramCount++}`);
      values.push(reminder_minutes);
    }
    if (ad_text !== undefined) {
      updates.push(`ad_text = $${paramCount++}`);
      values.push(ad_text || null);
    }
    if (placement !== undefined) {
      updates.push(`placement = $${paramCount++}`);
      values.push(placement || null);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes || null);
    }

    if (updates.length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    // Add id parameter
    values.push(id);

    const query = `
      UPDATE pending_ads 
      SET ${updates.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await sql(query, values);

    if (result.length === 0) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    return Response.json({
      message: "Submission updated successfully",
      pending_ad: result[0],
    });
  } catch (error) {
    console.error("Error updating pending ad:", error);
    return Response.json(
      { error: "Failed to update submission" },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
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

    // Check if the pending ad is marked as not_approved
    const pendingAd = await sql`
      SELECT status FROM pending_ads WHERE id = ${id}
    `;

    if (!pendingAd[0]) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    if (pendingAd[0].status !== "not_approved") {
      return Response.json(
        { error: "Can only delete ads marked as not approved" },
        { status: 400 },
      );
    }

    await sql`
      DELETE FROM pending_ads WHERE id = ${id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting pending ad:", error);
    return Response.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
