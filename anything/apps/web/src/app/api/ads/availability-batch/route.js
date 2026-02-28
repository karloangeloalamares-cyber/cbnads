import { db } from "../../utils/supabase-db.js";
import { checkBatchAvailability } from "../../utils/ad-availability.js";

export async function POST(request) {
  try {
    const supabase = db();
    const body = await request.json();
    const { dates, exclude_ad_id } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return Response.json(
        { error: "Missing required field: dates (array)" },
        { status: 400 },
      );
    }

    const result = await checkBatchAvailability({
      supabase,
      dates,
      excludeId: exclude_ad_id,
    });

    return Response.json(result);
  } catch (error) {
    console.error("Error checking batch availability:", error);
    return Response.json(
      { error: "Failed to check availability" },
      { status: 500 },
    );
  }
}
