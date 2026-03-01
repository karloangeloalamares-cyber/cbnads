import { db, normalizePostType } from "../../utils/supabase-db.js";
import { checkBatchAvailability } from "../../utils/ad-availability.js";

export async function POST(request) {
  try {
    const supabase = db();
    const body = await request.json();
    const { dates, post_type, postType, placement, exclude_ad_id, adId } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return Response.json(
        { error: "Missing required field: dates (array)" },
        { status: 400 },
      );
    }

    const normalizedPostType = post_type || postType ? normalizePostType(post_type || postType) : "";
    if (normalizedPostType && !["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
      return Response.json({ error: "Unsupported post type" }, { status: 400 });
    }

    if (placement && !["WhatsApp", "Website", "Both"].includes(String(placement))) {
      return Response.json({ error: "Unsupported placement" }, { status: 400 });
    }

    const result = await checkBatchAvailability({
      supabase,
      dates,
      excludeId: exclude_ad_id || adId,
    });

    return Response.json({
      ...result,
      availabilityByDate: result.results || {},
    });
  } catch (error) {
    console.error("[ads/availability-batch] Error checking availability", {
      message: error?.message || String(error),
    });
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
