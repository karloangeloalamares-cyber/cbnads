import { db, table } from "../../utils/supabase-db.js";
import { getSessionUser, requireAdmin } from "../../utils/auth-check.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizePreferences = (row, fallbackEmail = "") => ({
  email_enabled: row?.email_enabled ?? true,
  sms_enabled: row?.sms_enabled ?? false,
  reminder_time_value: row?.reminder_time_value ?? 1,
  reminder_time_unit: row?.reminder_time_unit ?? "hours",
  email_address: row?.email_address ?? fallbackEmail,
  phone_number: normalizeUSPhoneNumber(row?.phone_number ?? ""),
  sound_enabled: row?.sound_enabled ?? true,
});

async function findPreferenceRow(supabase, userId, email) {
  if (userId) {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from(table("admin_notification_preferences"))
      .select("*")
      .ilike("email_address", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  return null;
}

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const user = await getSessionUser(request);
    const email = String(user?.email || "").trim();
    const userId = UUID_REGEX.test(String(user?.id || "")) ? String(user.id) : null;
    const supabase = db();

    const row = await findPreferenceRow(supabase, userId, email);
    return Response.json({
      preferences: normalizePreferences(row, email),
    });
  } catch (err) {
    console.error("GET /api/admin/notification-preferences error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const user = await getSessionUser(request);
    const email = String(user?.email || "").trim();
    const userId = UUID_REGEX.test(String(user?.id || "")) ? String(user.id) : null;
    const body = await request.json();
    const normalizedPhoneNumber = normalizeUSPhoneNumber(body?.phone_number || "");

    if (normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
      return Response.json(
        { error: "Phone number must be a complete US number" },
        { status: 400 },
      );
    }

    const patch = {
      email_enabled: Boolean(body?.email_enabled),
      sms_enabled: Boolean(body?.sms_enabled),
      reminder_time_value: Number(body?.reminder_time_value) || 1,
      reminder_time_unit: body?.reminder_time_unit || "hours",
      email_address: body?.email_address || email || null,
      phone_number: normalizedPhoneNumber || null,
      sound_enabled: body?.sound_enabled !== undefined ? Boolean(body.sound_enabled) : true,
      updated_at: new Date().toISOString(),
    };

    const supabase = db();
    let saved = null;

    if (userId) {
      const payload = {
        ...patch,
        user_id: userId,
      };
      const { data, error } = await supabase
        .from(table("admin_notification_preferences"))
        .upsert(payload, { onConflict: "user_id" })
        .select("*")
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const existing = await findPreferenceRow(supabase, null, email);
      if (existing?.id) {
        const { data, error } = await supabase
          .from(table("admin_notification_preferences"))
          .update(patch)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase
          .from(table("admin_notification_preferences"))
          .insert({
            ...patch,
            user_id: null,
            created_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (error) throw error;
        saved = data;
      }
    }

    return Response.json({ success: true, preferences: normalizePreferences(saved, email) });
  } catch (err) {
    console.error("POST /api/admin/notification-preferences error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
