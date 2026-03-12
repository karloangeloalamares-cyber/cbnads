import { advertiserResponse, dateOnly, db, table } from "../../utils/supabase-db.js";
import { requireAdmin } from "../../utils/auth-check.js";
import { findAuthUserByEmail, normalizeEmail } from "../../utils/advertiser-auth.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";

const isInactive = (value) => String(value || "").toLowerCase() === "inactive";
const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

const isMissingRelationError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || /relation .* does not exist/i.test(message);
};

const isIgnorableSchemaError = (error) =>
  isMissingColumnError(error) || isMissingRelationError(error);

const isMissingAuthUserError = (error) => {
  const message = String(error?.message || "");
  const status = Number(error?.status || error?.statusCode || 0);
  return status === 404 || /user not found/i.test(message);
};

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
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
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
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
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
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
    }

    const supabase = db();
    const { id } = params;

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, email")
      .eq("id", id)
      .maybeSingle();

    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const advertiserName = String(advertiser.advertiser_name || "").trim();
    const advertiserEmail = normalizeEmail(advertiser.email || "");

    const collectIdsIntoSet = (targetSet, rows) => {
      for (const row of rows || []) {
        if (row?.id) {
          targetSet.add(String(row.id));
        }
      }
    };

    const adIds = new Set();
    let adsByAdvertiserId = await supabase
      .from(table("ads"))
      .select("id")
      .eq("advertiser_id", id);
    if (adsByAdvertiserId.error) {
      if (!isIgnorableSchemaError(adsByAdvertiserId.error)) {
        throw adsByAdvertiserId.error;
      }
      adsByAdvertiserId = { data: [] };
    }
    collectIdsIntoSet(adIds, adsByAdvertiserId.data);

    if (advertiserName) {
      const { data: adsByAdvertiserName, error: adsByNameError } = await supabase
        .from(table("ads"))
        .select("id")
        .eq("advertiser", advertiserName);
      if (adsByNameError && !isIgnorableSchemaError(adsByNameError)) {
        throw adsByNameError;
      }
      collectIdsIntoSet(adIds, adsByAdvertiserName);
    }

    const invoiceIds = new Set();
    let invoicesByAdvertiserId = await supabase
      .from(table("invoices"))
      .select("id")
      .eq("advertiser_id", id);
    if (invoicesByAdvertiserId.error) {
      if (!isIgnorableSchemaError(invoicesByAdvertiserId.error)) {
        throw invoicesByAdvertiserId.error;
      }
      invoicesByAdvertiserId = { data: [] };
    }
    collectIdsIntoSet(invoiceIds, invoicesByAdvertiserId.data);

    if (advertiserName) {
      const { data: invoicesByAdvertiserName, error: invoicesByNameError } = await supabase
        .from(table("invoices"))
        .select("id")
        .eq("advertiser_name", advertiserName);
      if (invoicesByNameError && !isIgnorableSchemaError(invoicesByNameError)) {
        throw invoicesByNameError;
      }
      collectIdsIntoSet(invoiceIds, invoicesByAdvertiserName);
    }

    const adIdList = Array.from(adIds);
    const invoiceIdList = Array.from(invoiceIds);

    if (adIdList.length > 0) {
      const { error: reminderDeleteError } = await supabase
        .from(table("sent_reminders"))
        .delete()
        .in("ad_id", adIdList);
      if (reminderDeleteError && !isIgnorableSchemaError(reminderDeleteError)) {
        throw reminderDeleteError;
      }
    }

    if (invoiceIdList.length > 0) {
      const { error: invoiceItemDeleteByInvoiceError } = await supabase
        .from(table("invoice_items"))
        .delete()
        .in("invoice_id", invoiceIdList);
      if (
        invoiceItemDeleteByInvoiceError &&
        !isIgnorableSchemaError(invoiceItemDeleteByInvoiceError)
      ) {
        throw invoiceItemDeleteByInvoiceError;
      }
    }

    if (adIdList.length > 0) {
      const { error: invoiceItemDeleteByAdError } = await supabase
        .from(table("invoice_items"))
        .delete()
        .in("ad_id", adIdList);
      if (invoiceItemDeleteByAdError && !isIgnorableSchemaError(invoiceItemDeleteByAdError)) {
        throw invoiceItemDeleteByAdError;
      }
    }

    if (invoiceIdList.length > 0) {
      const { error: invoiceDeleteError } = await supabase
        .from(table("invoices"))
        .delete()
        .in("id", invoiceIdList);
      if (invoiceDeleteError && !isIgnorableSchemaError(invoiceDeleteError)) {
        throw invoiceDeleteError;
      }
    }

    const { error: pendingDeleteByAdvertiserIdError } = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("advertiser_id", id);
    if (
      pendingDeleteByAdvertiserIdError &&
      !isIgnorableSchemaError(pendingDeleteByAdvertiserIdError)
    ) {
      throw pendingDeleteByAdvertiserIdError;
    }

    if (advertiserName) {
      const { error: pendingDeleteByNameError } = await supabase
        .from(table("pending_ads"))
        .delete()
        .eq("advertiser_name", advertiserName);
      if (pendingDeleteByNameError && !isIgnorableSchemaError(pendingDeleteByNameError)) {
        throw pendingDeleteByNameError;
      }
    }

    if (advertiserEmail) {
      const { error: pendingDeleteByEmailError } = await supabase
        .from(table("pending_ads"))
        .delete()
        .eq("email", advertiserEmail);
      if (pendingDeleteByEmailError && !isIgnorableSchemaError(pendingDeleteByEmailError)) {
        throw pendingDeleteByEmailError;
      }
    }

    if (adIdList.length > 0) {
      const { error: adsDeleteError } = await supabase
        .from(table("ads"))
        .delete()
        .in("id", adIdList);
      if (adsDeleteError) throw adsDeleteError;
    }

    const profileIds = new Set();
    const authUserIds = new Set();
    const collectProfileRows = (rows, { requireAdvertiserRole = false } = {}) => {
      for (const row of rows || []) {
        if (!row?.id) continue;
        const role = String(row?.role || "").trim().toLowerCase();
        if (requireAdvertiserRole && role !== "advertiser") {
          continue;
        }
        const profileId = String(row.id);
        profileIds.add(profileId);
        authUserIds.add(profileId);
      }
    };

    let profilesByAdvertiserId = await supabase
      .from("profiles")
      .select("id, role")
      .eq("advertiser_id", id);
    if (profilesByAdvertiserId.error) {
      if (!isIgnorableSchemaError(profilesByAdvertiserId.error)) {
        throw profilesByAdvertiserId.error;
      }
      profilesByAdvertiserId = { data: [] };
    }
    collectProfileRows(profilesByAdvertiserId.data);

    if (advertiserEmail) {
      const { data: profilesByEmail, error: profilesByEmailError } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("email", advertiserEmail);
      if (profilesByEmailError && !isIgnorableSchemaError(profilesByEmailError)) {
        throw profilesByEmailError;
      }
      collectProfileRows(profilesByEmail, { requireAdvertiserRole: true });

      const authUserByEmail = await findAuthUserByEmail(supabase, advertiserEmail);
      if (authUserByEmail?.id) {
        authUserIds.add(String(authUserByEmail.id));
      }
    }

    let deletedAuthUsers = 0;
    for (const userId of authUserIds) {
      const { error: deleteAuthUserError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteAuthUserError) {
        if (isMissingAuthUserError(deleteAuthUserError)) {
          continue;
        }
        throw deleteAuthUserError;
      }
      deletedAuthUsers += 1;
    }

    const profileIdList = Array.from(profileIds);
    if (profileIdList.length > 0) {
      const { error: profileDeleteError } = await supabase
        .from("profiles")
        .delete()
        .in("id", profileIdList);
      if (profileDeleteError && !isIgnorableSchemaError(profileDeleteError)) {
        throw profileDeleteError;
      }
    }

    const { error: advertiserDeleteError } = await supabase
      .from(table("advertisers"))
      .delete()
      .eq("id", id);
    if (advertiserDeleteError) throw advertiserDeleteError;

    return Response.json({
      success: true,
      message:
        "Advertiser account and all associated records were permanently deleted.",
      cleanup: {
        ads_deleted: adIdList.length,
        invoices_deleted: invoiceIdList.length,
        auth_users_deleted: deletedAuthUsers,
      },
    });
  } catch (error) {
    console.error("Error deleting advertiser:", error);
    return Response.json(
      { error: "Failed to delete advertiser" },
      { status: 500 },
    );
  }
}
