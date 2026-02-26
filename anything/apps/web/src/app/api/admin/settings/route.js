import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

async function getOrCreateSettings(supabase) {
  const { data: existing, error: existingError } = await supabase
    .from(table("admin_settings"))
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return {
      ...existing,
      max_ads_per_day:
        existing.max_ads_per_day ?? existing.max_ads_per_slot ?? 5,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: created, error: createError } = await supabase
    .from(table("admin_settings"))
    .insert({
      max_ads_per_slot: 5,
      default_post_time: "09:00",
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();
  if (createError) throw createError;
  return {
    ...created,
    max_ads_per_day:
      created.max_ads_per_day ?? created.max_ads_per_slot ?? 5,
  };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const settings = await getOrCreateSettings(supabase);
    return Response.json({ settings });
  } catch (error) {
    console.error("Error fetching admin settings:", error);
    return Response.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const maxAdsPerDay = toNumber(body?.max_ads_per_day, 0);
    if (maxAdsPerDay < 1) {
      return Response.json(
        { error: "max_ads_per_day must be at least 1" },
        { status: 400 },
      );
    }

    const supabase = db();
    const current = await getOrCreateSettings(supabase);
    let updateResult = await supabase
      .from(table("admin_settings"))
      .update({
        max_ads_per_day: maxAdsPerDay,
        max_ads_per_slot: maxAdsPerDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select("*")
      .single();

    if (updateResult.error) {
      const message = String(updateResult.error.message || "");
      if (!message.includes("max_ads_per_day")) {
        throw updateResult.error;
      }

      updateResult = await supabase
        .from(table("admin_settings"))
        .update({
          max_ads_per_slot: maxAdsPerDay,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id)
        .select("*")
        .single();
      if (updateResult.error) throw updateResult.error;
    }

    const updated = {
      ...updateResult.data,
      max_ads_per_day:
        updateResult.data?.max_ads_per_day ??
        updateResult.data?.max_ads_per_slot ??
        maxAdsPerDay,
    };

    return Response.json({ settings: updated });
  } catch (error) {
    console.error("Error updating admin settings:", error);
    return Response.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
