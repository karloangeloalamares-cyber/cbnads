import { db, normalizePostType } from "../../utils/supabase-db.js";
import { checkSingleDateAvailability } from "../../utils/ad-availability.js";

export async function POST(request) {
  try {
    const supabase = db();
    const body = await request.json();
    const { date, post_type, postType, placement, post_time, postTime, exclude_ad_id, adId } = body;
    const normalizedPostType = normalizePostType(post_type || postType);

    if (!date || !normalizedPostType) {
      return Response.json(
        { error: "Missing required fields: date and postType" },
        { status: 400 },
      );
    }

    if (!["one_time", "daily_run", "custom_schedule"].includes(normalizedPostType)) {
      return Response.json({ error: "Unsupported post type" }, { status: 400 });
    }

    if (placement && !["WhatsApp", "Website", "Both"].includes(String(placement))) {
      return Response.json({ error: "Unsupported placement" }, { status: 400 });
    }

    const result = await checkSingleDateAvailability({
      supabase,
      date,
      postType: normalizedPostType,
      postTime: post_time || postTime,
      excludeId: exclude_ad_id || adId,
    });

    return Response.json(result);
  } catch (error) {
    console.error("[ads/availability] Error checking availability", {
      message: error?.message || String(error),
    });
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
