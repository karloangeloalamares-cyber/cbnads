import { db } from "../../utils/supabase-db.js";
import { checkSingleDateAvailability } from "../../utils/ad-availability.js";

export async function POST(request) {
  try {
    const supabase = db();
    const body = await request.json();
    const { date, post_type, post_time, exclude_ad_id } = body;

    if (!date || !post_type) {
      return Response.json(
        { error: "Missing required fields: date and post_type" },
        { status: 400 },
      );
    }

    const result = await checkSingleDateAvailability({
      supabase,
      date,
      postType: post_type,
      postTime: post_time,
      excludeId: exclude_ad_id,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Error checking availability:", error);
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
