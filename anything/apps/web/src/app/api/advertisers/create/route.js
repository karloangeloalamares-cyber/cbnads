import { advertiserResponse, db, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      advertiser_name,
      contact_name,
      email,
      phone_number,
      status = "active",
    } = body;

    if (!advertiser_name || !contact_name) {
      return Response.json(
        { error: "Advertiser name and contact name are required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const basePayload = {
      advertiser_name,
      contact_name,
      email: email || null,
      phone: phone_number || null,
      created_at: now,
      updated_at: now,
    };

    const extendedPayload = {
      ...basePayload,
      phone_number: phone_number || null,
      status: String(status || "active").toLowerCase(),
    };

    let insertResult = await supabase
      .from(table("advertisers"))
      .insert(extendedPayload)
      .select("*")
      .single();

    if (insertResult.error) {
      const message = String(insertResult.error.message || "");
      const missingCompatColumn =
        message.includes("phone_number") || message.includes("status");
      if (!missingCompatColumn) throw insertResult.error;

      insertResult = await supabase
        .from(table("advertisers"))
        .insert(basePayload)
        .select("*")
        .single();
      if (insertResult.error) throw insertResult.error;
    }

    return Response.json({ advertiser: advertiserResponse(insertResult.data) });
  } catch (error) {
    console.error("Error creating advertiser:", error);
    return Response.json(
      { error: "Failed to create advertiser" },
      { status: 500 },
    );
  }
}
