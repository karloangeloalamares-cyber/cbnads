import { advertiserResponse, dateOnly, db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";

const isInactive = (value) => String(value || "").toLowerCase() === "inactive";

const isFutureOrToday = (value) => {
  const asDate = dateOnly(value);
  if (!asDate) return false;
  return asDate >= dateOnly(new Date());
};

const hasFutureSchedule = (ad) => {
  if (isFutureOrToday(ad?.schedule) || isFutureOrToday(ad?.post_date_from)) {
    return true;
  }
  if (Array.isArray(ad?.custom_dates)) {
    return ad.custom_dates.some((value) => isFutureOrToday(value));
  }
  return false;
};

// GET advertiser details with all ads
export async function GET(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const { data: adsByName, error: adsByNameError } = await supabase
      .from(table("ads"))
      .select("*")
      .eq("advertiser", advertiser.advertiser_name)
      .order("created_at", { ascending: false });
    if (adsByNameError) throw adsByNameError;

    const { data: adsById, error: adsByIdError } = await supabase
      .from(table("ads"))
      .select("*")
      .eq("advertiser_id", id)
      .order("created_at", { ascending: false });
    if (adsByIdError) throw adsByIdError;

    const adsMap = new Map();
    for (const ad of [...(adsByName || []), ...(adsById || [])]) {
      adsMap.set(ad.id, ad);
    }

    return Response.json({
      advertiser: advertiserResponse(advertiser),
      ads: Array.from(adsMap.values()),
    });
  } catch (error) {
    console.error("Error fetching advertiser details:", error);
    return Response.json(
      { error: "Failed to fetch advertiser details" },
      { status: 500 },
    );
  }
}

// PUT - Update advertiser
export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;
    const body = await request.json();
    const { advertiser_name, contact_name, email, phone_number, status } = body;
    const normalizedPhoneNumber = normalizeUSPhoneNumber(phone_number || "");

    if (normalizedPhoneNumber && !isCompleteUSPhoneNumber(normalizedPhoneNumber)) {
      return Response.json(
        { error: "Phone number must be a complete US number" },
        { status: 400 },
      );
    }

    const { data: oldAdvertiser, error: oldAdvertiserError } = await supabase
      .from(table("advertisers"))
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (oldAdvertiserError) throw oldAdvertiserError;
    if (!oldAdvertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const oldName = oldAdvertiser.advertiser_name;
    const oldStatus = oldAdvertiser.status ?? "active";
    const normalizedStatus =
      status === undefined ? oldStatus : String(status || "active").toLowerCase();

    const basePatch = {
      advertiser_name,
      contact_name,
      email,
      phone: normalizedPhoneNumber || null,
      updated_at: new Date().toISOString(),
    };
    const extendedPatch = {
      ...basePatch,
      phone_number: normalizedPhoneNumber || null,
      status: normalizedStatus,
    };

    let updateResult = await supabase
      .from(table("advertisers"))
      .update(extendedPatch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateResult.error) {
      const message = String(updateResult.error.message || "");
      const missingCompatColumn =
        message.includes("phone_number") || message.includes("status");
      if (!missingCompatColumn) throw updateResult.error;

      updateResult = await supabase
        .from(table("advertisers"))
        .update(basePatch)
        .eq("id", id)
        .select("*")
        .single();
      if (updateResult.error) throw updateResult.error;
    }

    const updated = updateResult.data;

    // Cascade rename to related records
    if (oldName !== advertiser_name) {
      const { error: adsRenameError } = await supabase
        .from(table("ads"))
        .update({ advertiser: advertiser_name, advertiser_id: id })
        .eq("advertiser", oldName);
      if (adsRenameError) throw adsRenameError;

      const { error: pendingRenameError } = await supabase
        .from(table("pending_ads"))
        .update({ advertiser_name })
        .eq("advertiser_name", oldName);
      if (pendingRenameError) throw pendingRenameError;

      const { error: invoicesRenameError } = await supabase
        .from(table("invoices"))
        .update({ advertiser_name })
        .eq("advertiser_name", oldName);
      if (invoicesRenameError) throw invoicesRenameError;
    }

    // If advertiser became inactive, move future non-published ads to Draft
    if (updated?.status !== undefined && isInactive(normalizedStatus) && !isInactive(oldStatus)) {
      const { data: ads, error: adsError } = await supabase
        .from(table("ads"))
        .select("id, status, schedule, post_date_from, custom_dates")
        .eq("advertiser", advertiser_name);

      if (adsError) throw adsError;

      const adIdsToDraft = (ads || [])
        .filter((ad) => String(ad.status || "").toLowerCase() !== "published")
        .filter((ad) => hasFutureSchedule(ad))
        .map((ad) => ad.id);

      if (adIdsToDraft.length > 0) {
        const { error: draftUpdateError } = await supabase
          .from(table("ads"))
          .update({ status: "Draft" })
          .in("id", adIdsToDraft);
        if (draftUpdateError) throw draftUpdateError;
      }
    }

    return Response.json({ advertiser: advertiserResponse(updated) });
  } catch (error) {
    console.error("Error updating advertiser:", error);
    return Response.json(
      { error: "Failed to update advertiser" },
      { status: 500 },
    );
  }
}

// DELETE - Delete advertiser and all associated data
export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("advertiser_name")
      .eq("id", id)
      .maybeSingle();

    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const advertiserName = advertiser.advertiser_name;

    const { data: adRows, error: adsFetchError } = await supabase
      .from(table("ads"))
      .select("id")
      .or(`advertiser.eq.${advertiserName},advertiser_id.eq.${id}`);
    if (adsFetchError) throw adsFetchError;

    const adIds = (adRows || []).map((row) => row.id);
    if (adIds.length > 0) {
      const { error: reminderDeleteError } = await supabase
        .from(table("sent_reminders"))
        .delete()
        .in("ad_id", adIds);
      if (reminderDeleteError) throw reminderDeleteError;

      const { error: adsDeleteError } = await supabase
        .from(table("ads"))
        .delete()
        .in("id", adIds);
      if (adsDeleteError) throw adsDeleteError;
    }

    const { error: advertiserDeleteError } = await supabase
      .from(table("advertisers"))
      .delete()
      .eq("id", id);
    if (advertiserDeleteError) throw advertiserDeleteError;

    return Response.json({
      success: true,
      message: "Advertiser and all associated data deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting advertiser:", error);
    return Response.json(
      { error: "Failed to delete advertiser" },
      { status: 500 },
    );
  }
}
