import { db, table } from "../../utils/supabase-db.js";

export async function GET(request) {
  try {
    const supabase = db();
    const { data, error } = await supabase
      .from(table("products"))
      .select("id, product_name, placement, price, description, created_at")
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
