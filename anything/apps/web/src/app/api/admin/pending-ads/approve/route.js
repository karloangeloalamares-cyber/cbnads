import { db, table } from "../../../utils/supabase-db.js";
import { requireAdmin } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../../utils/ad-availability.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      pending_ad_id,
      use_existing_advertiser,
      existing_advertiser_id,
      force_inactive,
    } = body;

    if (!pending_ad_id) {
      return Response.json({ error: "Missing pending_ad_id" }, { status: 400 });
    }

    const { data: ad, error: pendingError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", pending_ad_id)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!ad) {
      return Response.json({ error: "Pending ad not found" }, { status: 404 });
    }

    let advertiserId = null;
    let advertiserName = ad.advertiser_name;
    let existingAdvertiserInactive = false;

    if (use_existing_advertiser && existing_advertiser_id) {
      const { data: existingAdvertiser, error: existingError } = await supabase
        .from(table("advertisers"))
        .select("*")
        .eq("id", existing_advertiser_id)
        .maybeSingle();
      if (existingError) throw existingError;

      if (!existingAdvertiser) {
        return Response.json(
          { error: "Advertiser not found" },
          { status: 404 },
        );
      }

      advertiserId = existingAdvertiser.id;
      advertiserName = existingAdvertiser.advertiser_name;
      existingAdvertiserInactive =
        String(existingAdvertiser.status || "").toLowerCase() === "inactive";

      if (existingAdvertiserInactive && !force_inactive) {
        return Response.json(
          {
            warning: true,
            message: `Advertiser "${advertiserName}" is currently Inactive. The approved ad will be created as Draft status. Approve anyway?`,
            advertiserStatus: "Inactive",
          },
          { status: 200 },
        );
      }
    } else {
      const nowIso = new Date().toISOString();
      let createAdvertiserResult = await supabase
        .from(table("advertisers"))
        .insert({
          advertiser_name: ad.advertiser_name,
          contact_name: ad.contact_name,
          email: ad.email,
          phone: ad.phone_number || ad.phone || null,
          phone_number: ad.phone_number || ad.phone || null,
          status: "active",
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, advertiser_name")
        .single();

      if (createAdvertiserResult.error) {
        const message = String(createAdvertiserResult.error.message || "");
        const missingCompatColumn =
          message.includes("phone_number") || message.includes("status");
        if (!missingCompatColumn) throw createAdvertiserResult.error;

        createAdvertiserResult = await supabase
          .from(table("advertisers"))
          .insert({
            advertiser_name: ad.advertiser_name,
            contact_name: ad.contact_name,
            email: ad.email,
            phone: ad.phone_number || ad.phone || null,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select("id, advertiser_name")
          .single();
        if (createAdvertiserResult.error) throw createAdvertiserResult.error;
      }

      const newAdvertiser = createAdvertiserResult.data;

      advertiserId = newAdvertiser.id;
      advertiserName = newAdvertiser.advertiser_name;
    }

    const advertiserInactive =
      use_existing_advertiser &&
      existing_advertiser_id &&
      existingAdvertiserInactive;

    const adStatus = advertiserInactive ? "Draft" : "Scheduled";
    const nowIso = new Date().toISOString();

    if (ad.post_type === "One-Time Post" && ad.post_date_from) {
      const availability = await checkSingleDateAvailability({
        supabase,
        date: ad.post_date_from,
        postType: ad.post_type,
        postTime: ad.post_time,
        excludeId: pending_ad_id,
      });

      if (!availability.available) {
        return Response.json(
          {
            error: availability.is_day_full
              ? "Ad limit reached for this date. Please choose the next available day."
              : "This time slot is already booked. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    if (ad.post_type === "Daily Run" && ad.post_date_from && ad.post_date_to) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(ad.post_date_from, ad.post_date_to),
        excludeId: pending_ad_id,
      });
      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more dates in this range. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    if (ad.post_type === "Custom Schedule" && Array.isArray(ad.custom_dates) && ad.custom_dates.length > 0) {
      const availability = await checkBatchAvailability({
        supabase,
        dates: ad.custom_dates.map((entry) =>
          entry && typeof entry === "object" ? entry.date : entry,
        ),
        excludeId: pending_ad_id,
      });
      const blockedDates = Object.entries(availability.results || {})
        .filter(([, info]) => info?.is_full)
        .map(([dateValue]) => dateValue);

      if (blockedDates.length > 0) {
        return Response.json(
          {
            error:
              "Ad limit reached on one or more selected dates. Please choose different dates.",
            fully_booked_dates: blockedDates,
          },
          { status: 400 },
        );
      }
    }

    const { data: newAd, error: createAdError } = await supabase
      .from(table("ads"))
      .insert({
        ad_name: ad.ad_name,
        advertiser: advertiserName,
        advertiser_id: advertiserId,
        status: adStatus,
        post_type: ad.post_type,
        placement: ad.placement || "Standard",
        payment: "pending",
        schedule: ad.post_type === "One-Time Post" ? ad.post_date_from : null,
        post_date: ad.post_type === "One-Time Post" ? ad.post_date_from : null,
        post_date_from: ad.post_date_from || null,
        post_date_to: ad.post_date_to || null,
        custom_dates: Array.isArray(ad.custom_dates) ? ad.custom_dates : [],
        post_time: ad.post_time || null,
        reminder_minutes: ad.reminder_minutes || 15,
        ad_text: ad.ad_text || null,
        media: Array.isArray(ad.media) ? ad.media : [],
        notes: ad.notes || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();
    if (createAdError) throw createAdError;

    await updateAdvertiserNextAdDate(advertiserName);
    const { error: cleanupError } = await supabase
      .from(table("pending_ads"))
      .delete()
      .eq("id", pending_ad_id);
    if (cleanupError) throw cleanupError;

    return Response.json({
      success: true,
      ad: newAd,
      advertiser_id: advertiserId,
    });
  } catch (error) {
    console.error("Error approving ad:", error);
    return Response.json({ error: "Failed to approve ad" }, { status: 500 });
  }
}
