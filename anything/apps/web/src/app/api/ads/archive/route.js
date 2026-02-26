import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";

// POST - Archive old published ads (Published + older than 90 days)
export async function POST(request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Archive ads that are Published and published_at is more than 90 days ago
    const result = await sql`
      UPDATE ads
      SET archived = TRUE
      WHERE status = 'Published'
      AND published_at IS NOT NULL
      AND published_at < NOW() - INTERVAL '90 days'
      AND archived = FALSE
      RETURNING id, ad_name, published_at
    `;

    return Response.json({
      success: true,
      archivedCount: result.length,
      archivedAds: result,
      message: `Archived ${result.length} old published ad${result.length !== 1 ? "s" : ""}`,
    });
  } catch (error) {
    console.error("Error archiving old ads:", error);
    return Response.json(
      { error: "Failed to archive old ads" },
      { status: 500 },
    );
  }
}

// PUT - Manually archive/unarchive specific ad
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, archived } = body;

    if (!id || archived === undefined) {
      return Response.json(
        { error: "Ad ID and archived status are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      UPDATE ads
      SET archived = ${archived}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      ad: result[0],
      message: archived ? "Ad archived" : "Ad unarchived",
    });
  } catch (error) {
    console.error("Error updating ad archive status:", error);
    return Response.json(
      { error: "Failed to update ad archive status" },
      { status: 500 },
    );
  }
}
