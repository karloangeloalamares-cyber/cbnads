import sql from "../../../utils/sql";
import { auth } from "../../../../../auth";

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

    // Only show pending and rejected (not_approved) ads
    // Approved ads are deleted and moved to the ads table
    const pendingAds = await sql`
      SELECT * FROM pending_ads
      WHERE status IN ('pending', 'not_approved')
      ORDER BY 
        CASE status 
          WHEN 'pending' THEN 1 
          WHEN 'not_approved' THEN 2 
        END,
        created_at DESC
    `;

    return Response.json({ pending_ads: pendingAds });
  } catch (error) {
    console.error("Error fetching pending ads:", error);
    return Response.json(
      { error: "Failed to fetch pending ads" },
      { status: 500 },
    );
  }
}
