import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";
import { updateAdvertiserNextAdDate } from "../../../utils/update-advertiser-next-ad.js";
import { APP_TIME_ZONE } from "../../../../../lib/timezone.js";

const isMissingColumnError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42703" || /column .* does not exist/i.test(message);
};

export async function POST(request, { params }) {
  try {
    const auth = await requirePermission("submissions:convert", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const submissionId = String(params?.id || "").trim();
    if (!submissionId) {
      return Response.json({ error: "Submission ID is required" }, { status: 400 });
    }

    const supabase = db();
    const body = await request.json();
    const {
      advertiser_id,
      placement,
      product_id,
      post_type,
      schedule = {},
      billingAction = "go_to_billing",
      review_notes = "",
      ad_name,
      ad_text,
      notes,
      media,
    } = body;

    if (!advertiser_id || !placement || !product_id || !post_type) {
      return Response.json(
        {
          error: "advertiser_id, placement, product_id, and post_type are required",
        },
        { status: 400 },
      );
    }

    const { data: submission, error: submissionError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    const { data: advertiser, error: advertiserError } = await supabase
      .from(table("advertisers"))
      .select("id, advertiser_name, status")
      .eq("id", advertiser_id)
      .maybeSingle();
    if (advertiserError) throw advertiserError;
    if (!advertiser) {
      return Response.json({ error: "Advertiser not found" }, { status: 404 });
    }

    const { data: product, error: productError } = await supabase
      .from(table("products"))
      .select("id, product_name, price")
      .eq("id", product_id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const customDates = Array.isArray(schedule.custom_dates)
      ? schedule.custom_dates.filter(Boolean)
      : Array.isArray(submission.custom_dates)
        ? submission.custom_dates
        : [];
    const postDate =
      schedule.post_date || schedule.start_date || submission.post_date || submission.post_date_from || "";
    const payload = {
      ad_name: String(ad_name || submission.ad_name || "").trim(),
      advertiser: advertiser.advertiser_name,
      advertiser_id: advertiser.id,
      product_id: product.id,
      product_name: product.product_name,
      price: product.price || 0,
      status: "Draft",
      payment: "Pending",
      post_type,
      placement,
      schedule: post_type === "one_time" ? postDate : null,
      post_date: post_type === "one_time" ? postDate : null,
      post_date_from:
        post_type === "daily_run" ? schedule.start_date || submission.post_date_from || "" : postDate,
      post_date_to:
        post_type === "daily_run" ? schedule.end_date || submission.post_date_to || "" : null,
      custom_dates: post_type === "custom_schedule" ? customDates : [],
      post_time: schedule.post_time || submission.post_time || null,
      scheduled_timezone: APP_TIME_ZONE,
      reminder_minutes: submission.reminder_minutes || 15,
      ad_text: String(ad_text || submission.ad_text || "").trim() || null,
      media: Array.isArray(media) ? media : Array.isArray(submission.media) ? submission.media : [],
      notes: String(notes || submission.notes || "").trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: ad, error: adError } = await supabase
      .from(table("ads"))
      .insert(payload)
      .select("*")
      .single();
    if (adError) throw adError;

    await updateAdvertiserNextAdDate(advertiser.advertiser_name);

    const submissionPatch = {
      status: "approved",
      review_notes: review_notes || null,
      advertiser_id: advertiser.id,
      product_id: product.id,
      linked_ad_id: ad.id,
      linked_invoice_id: null,
      updated_at: new Date().toISOString(),
    };

    let updateResult = await supabase
      .from(table("pending_ads"))
      .update(submissionPatch)
      .eq("id", submissionId)
      .select("*")
      .single();

    if (updateResult.error && isMissingColumnError(updateResult.error)) {
      const fallbackPatch = {
        status: "approved",
        updated_at: new Date().toISOString(),
      };
      updateResult = await supabase
        .from(table("pending_ads"))
        .update(fallbackPatch)
        .eq("id", submissionId)
        .select("*")
        .single();
    }
    if (updateResult.error) throw updateResult.error;

    return Response.json({
      submission: updateResult.data,
      ad,
      billingContext: {
        openBilling: billingAction === "go_to_billing",
        adIds: [ad.id],
      },
    });
  } catch (error) {
    console.error("Error converting submission:", error);
    return Response.json({ error: "Failed to convert submission" }, { status: 500 });
  }
}
