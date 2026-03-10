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
    const normalizedAdvertiserName = String(advertiser_name || "").trim();
    const normalizedContactName = String(contact_name || "").trim();
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedPhoneNumber = normalizeUSPhoneNumber(phone_number || "");

    if (normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
      return Response.json(
        { error: "Phone number must be a complete US number" },
        { status: 400 },
      );
    }

    if (!normalizedAdvertiserName || !normalizedContactName) {
      return Response.json(
        { error: "Advertiser name and contact name are required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const basePayload = {
      advertiser_name: normalizedAdvertiserName,
      contact_name: normalizedContactName,
      email: normalizedEmail || null,
      phone: normalizedPhoneNumber || null,
      created_at: now,
      updated_at: now,
    };

    const extendedPayload = {
      ...basePayload,
      phone_number: normalizedPhoneNumber || null,
      status: String(status || "active").toLowerCase(),
    };

    let existing = null;
    if (normalizedEmail) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("*")
        .ilike("email", normalizedEmail)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existing = data || null;
    }

    if (!existing && normalizedAdvertiserName) {
      const { data, error } = await supabase
        .from(table("advertisers"))
        .select("*")
        .ilike("advertiser_name", normalizedAdvertiserName)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existing = data || null;
    }

    if (existing?.id) {
      const mergedBasePayload = {
        advertiser_name: normalizedAdvertiserName || existing.advertiser_name || null,
        contact_name: normalizedContactName || existing.contact_name || null,
        email: normalizedEmail || existing.email || null,
        phone: normalizedPhoneNumber || existing.phone || existing.phone_number || null,
        updated_at: now,
      };

      const mergedExtendedPayload = {
        ...mergedBasePayload,
        phone_number:
          normalizedPhoneNumber || existing.phone_number || existing.phone || null,
        status: String(status || existing.status || "active").toLowerCase(),
      };

      let updateResult = await supabase
        .from(table("advertisers"))
        .update(mergedExtendedPayload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateResult.error) {
        const message = String(updateResult.error.message || "");
        const missingCompatColumn =
          message.includes("phone_number") || message.includes("status");
        if (!missingCompatColumn) throw updateResult.error;

        updateResult = await supabase
          .from(table("advertisers"))
          .update(mergedBasePayload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (updateResult.error) throw updateResult.error;
      }

      return Response.json({
        advertiser: advertiserResponse(updateResult.data),
        deduped: true,
      });
    }

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
