import { advertiserResponse, db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";

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
    const normalizedPhoneNumber = normalizeUSPhoneNumber(phone_number || "");

    if (normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
      return Response.json(
        { error: "Phone number must be a complete US number" },
        { status: 400 },
      );
    }

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
      phone: normalizedPhoneNumber || null,
      created_at: now,
      updated_at: now,
    };

    const extendedPayload = {
      ...basePayload,
      phone_number: normalizedPhoneNumber || null,
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
