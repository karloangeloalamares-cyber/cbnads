import { db, table } from "@/app/api/utils/supabase-db";

export async function GET() {
  try {
    const supabase = db();
    const { data, error } = await supabase
      .from(table("products"))
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json(data || []);
  } catch (error) {
    console.error("Error fetching products:", error);
    return Response.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }
}
