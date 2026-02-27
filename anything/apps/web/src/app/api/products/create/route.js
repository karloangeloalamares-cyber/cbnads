import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const { product_name, placement, price } = body;

    if (!product_name || price === undefined) {
      return Response.json(
        { error: "Product name and price are required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const basePayload = {
      product_name,
      price: toNumber(price, 0),
      created_at: now,
      updated_at: now,
    };

    const extendedPayload = {
      ...basePayload,
      placement: placement || "Standard",
    };

    let insertResult = await supabase
      .from(table("products"))
      .insert(extendedPayload)
      .select("*")
      .single();

    if (insertResult.error) {
      const message = String(insertResult.error.message || "");
      const missingPlacement = message.includes("placement");
      if (!missingPlacement) throw insertResult.error;

      insertResult = await supabase
        .from(table("products"))
        .insert(basePayload)
        .select("*")
        .single();
      if (insertResult.error) throw insertResult.error;
    }

    return Response.json(insertResult.data);
  } catch (error) {
    console.error("Error creating product:", error);
    return Response.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}
