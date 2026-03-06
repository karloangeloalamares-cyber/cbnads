import { db, table } from "../../utils/supabase-db.js";
import { isAdvertiserUser, isInternalUser, requireAuth } from "../../utils/auth-check.js";

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    if (!isInternalUser(auth.user) && !isAdvertiserUser(auth.user)) {
      return Response.json(
        { error: "Unauthorized - Product access required" },
        { status: 403 },
      );
    }

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
