import sql from "../../utils/sql";
import { auth } from "../../../../auth";

export async function GET(request) {
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

    const settings = await sql`
      SELECT * FROM admin_settings ORDER BY id LIMIT 1
    `;

    if (!settings[0]) {
      // Create default settings if none exist
      const newSettings = await sql`
        INSERT INTO admin_settings (max_ads_per_day)
        VALUES (5)
        RETURNING *
      `;
      return Response.json({ settings: newSettings[0] });
    }

    return Response.json({ settings: settings[0] });
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return Response.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
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
    const { max_ads_per_day } = body;

    if (max_ads_per_day === undefined || max_ads_per_day < 1) {
      return Response.json(
        { error: "max_ads_per_day must be at least 1" },
        { status: 400 },
      );
    }

    const updated = await sql`
      UPDATE admin_settings
      SET max_ads_per_day = ${max_ads_per_day},
          updated_at = NOW()
      WHERE id = (SELECT id FROM admin_settings ORDER BY id LIMIT 1)
      RETURNING *
    `;

    return Response.json({ settings: updated[0] });
  } catch (error) {
    console.error("Error updating admin settings:", error);
    return Response.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
