import { db, normalizePostType } from "../../utils/supabase-db.js";
import { checkBatchAvailability } from "../../utils/ad-availability.js";
import { hasSupabaseAdminConfig } from "../../../../lib/supabaseAdmin.js";

export async function POST(request) {
  // Surface configuration errors clearly
  if (!hasSupabaseAdminConfig) {
    console.error("[ads/availability-batch] Supabase admin not configured — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return Response.json(
      { error: "Service not configured" },
      { status: 503 },
    );
  }

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
    const message = error?.message || String(error);
    const code = error?.code;
    const hint = error?.hint;
    const details = error?.details;
    console.error(
      "[ads/availability-batch] Runtime error:",
      { message, code, hint, details },
      error?.stack || "",
    );
    return Response.json(
      { error: message || "Failed to check availability", code },
      { status: 500 },
    );
  }
}
