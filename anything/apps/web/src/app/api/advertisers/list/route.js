import { advertiserResponse, db, table } from "@/app/api/utils/supabase-db";

export async function GET(request) {
  try {
    const supabase = db();
    const { data, error } = await supabase
      .from(table("advertisers"))
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ advertisers: (data || []).map(advertiserResponse) });
  } catch (error) {
    console.error("Error fetching advertisers:", error);
    return Response.json(
      { error: "Failed to fetch advertisers" },
      { status: 500 },
    );
  }
}
