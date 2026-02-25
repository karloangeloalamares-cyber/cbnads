import sql from "../../utils/sql";
import { auth } from "../../../../auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if user is admin
    const userRows =
      await sql`SELECT role FROM auth_users WHERE id = ${userId}`;
    if (!userRows[0] || userRows[0].role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await sql`
      SELECT 
        email_enabled, 
        sms_enabled, 
        reminder_time_value, 
        reminder_time_unit,
        email_address,
        phone_number
      FROM admin_notification_preferences 
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      // Return defaults if no preferences exist
      return Response.json({
        preferences: {
          email_enabled: true,
          sms_enabled: false,
          reminder_time_value: 1,
          reminder_time_unit: "hours",
          email_address: session.user.email || "",
          phone_number: "",
        },
      });
    }

    return Response.json({ preferences: rows[0] });
  } catch (err) {
    console.error("GET /api/admin/notification-preferences error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if user is admin
    const userRows =
      await sql`SELECT role FROM auth_users WHERE id = ${userId}`;
    if (!userRows[0] || userRows[0].role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      email_enabled,
      sms_enabled,
      reminder_time_value,
      reminder_time_unit,
      email_address,
      phone_number,
    } = body;

    // Upsert preferences
    const rows = await sql`
      INSERT INTO admin_notification_preferences (
        user_id, 
        email_enabled, 
        sms_enabled, 
        reminder_time_value, 
        reminder_time_unit,
        email_address,
        phone_number,
        updated_at
      )
      VALUES (
        ${userId}, 
        ${email_enabled}, 
        ${sms_enabled}, 
        ${reminder_time_value}, 
        ${reminder_time_unit},
        ${email_address || null},
        ${phone_number || null},
        NOW()
      )
      ON CONFLICT (user_id) 
      DO UPDATE SET
        email_enabled = ${email_enabled},
        sms_enabled = ${sms_enabled},
        reminder_time_value = ${reminder_time_value},
        reminder_time_unit = ${reminder_time_unit},
        email_address = ${email_address || null},
        phone_number = ${phone_number || null},
        updated_at = NOW()
      RETURNING *
    `;

    return Response.json({ success: true, preferences: rows[0] });
  } catch (err) {
    console.error("POST /api/admin/notification-preferences error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
