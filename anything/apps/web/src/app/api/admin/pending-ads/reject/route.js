import sql from "../../../utils/sql";
import { auth } from "../../../../../auth";

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
    const { pending_ad_id } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    await sql`
      UPDATE pending_ads
      SET status = 'not_approved',
          rejected_at = NOW()
      WHERE id = ${pending_ad_id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error rejecting pending ad:", error);
    return Response.json({ error: "Failed to reject ad" }, { status: 500 });
  }
}
