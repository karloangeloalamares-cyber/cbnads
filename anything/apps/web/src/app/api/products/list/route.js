import { db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

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
