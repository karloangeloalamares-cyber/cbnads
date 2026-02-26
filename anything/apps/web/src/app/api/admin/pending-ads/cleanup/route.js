import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

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

    // Find all pending ads with 'approved' status (these got stuck due to old code)
    const stuckAds = await sql`
      SELECT * FROM pending_ads WHERE status = 'approved'
    `;

    // Delete them since they should have been removed after approval
    const deleted = await sql`
      DELETE FROM pending_ads WHERE status = 'approved'
      RETURNING *
    `;

    return Response.json({
      success: true,
      message: `Cleaned up ${deleted.length} stuck 'approved' records`,
      deleted_records: deleted,
    });
  } catch (error) {
    console.error("Error cleaning up pending ads:", error);
    return Response.json(
      { error: "Failed to cleanup pending ads" },
      { status: 500 },
    );
  }
}
