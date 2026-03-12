import { db, normalizePostType, table } from "../../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAuth,
  resolveAdvertiserScope,
} from "../../utils/auth-check.js";
import { can } from "../../../../lib/permissions.js";
import {
  checkBatchAvailability,
  checkSingleDateAvailability,
  expandDateRange,
} from "../../utils/ad-availability.js";
import {
  isCompleteUSPhoneNumber,
  normalizeUSPhoneNumber,
} from "../../../../lib/phone.js";
import { parseReminderMinutes } from "../../utils/reminder-minutes.js";

const normalizeDateOnly = (value) => String(value || "").trim().slice(0, 10);

const normalizeCustomDateEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const date = normalizeDateOnly(entry.date);
        if (!date) {
          return null;
        }
        const normalized = {
          ...entry,
          date,
        };
        if (entry.time !== undefined) {
          normalized.time = String(entry.time || "").trim();
        }
        if (entry.reminder !== undefined) {
          normalized.reminder = String(entry.reminder || "").trim();
        }
        return normalized;
      }
      return normalizeDateOnly(entry);
    })
    .filter(Boolean);

const customDateValue = (entry) =>
  entry && typeof entry === "object" ? normalizeDateOnly(entry.date) : normalizeDateOnly(entry);

const optionalPendingSubmissionColumns = new Set([
  "advertiser_id",
  "product_id",
  "product_name",
  "price",
]);

const missingColumnName = (error) => {
  const message = String(error?.message || "");
  const postgresMatch = message.match(/column\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)\s+does not exist/i);
  if (postgresMatch?.[1]) {
    return postgresMatch[1].toLowerCase();
  }

  const schemaCacheMatch = message.match(/could not find the '([^']+)' column/i);
  return schemaCacheMatch?.[1] ? schemaCacheMatch[1].toLowerCase() : "";
};

const updatePendingSubmissionRecord = async (supabase, submissionId, patch) => {
  const updatePatch = { ...patch };

  while (true) {
    const result = await supabase
      .from(table("pending_ads"))
      .update(updatePatch)
      .eq("id", submissionId)
      .select("*")
      .maybeSingle();

    if (!result.error) {
      return result.data;
    }

    const missingColumn = missingColumnName(result.error);
    if (
      missingColumn &&
      optionalPendingSubmissionColumns.has(missingColumn) &&
      Object.prototype.hasOwnProperty.call(updatePatch, missingColumn)
    ) {
      delete updatePatch[missingColumn];
      continue;
    }

    throw result.error;
  }
};

export async function GET(request, { params }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    if (!isAdvertiserUser(auth.user) && !can(auth.user.role, "submissions:view")) {
      return Response.json({ error: "Unauthorized - Submission access required" }, { status: 403 });
    }

    const submissionId = String(params?.id || "").trim();
    if (!submissionId) {
      return Response.json({ error: "Submission ID is required" }, { status: 400 });
    }

    const supabase = db();
    const { data, error } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    if (isAdvertiserUser(auth.user)) {
      const scope = await resolveAdvertiserScope(auth.user);
      if (
        !matchesAdvertiserScope(data, scope, {
          advertiserNameFields: ["advertiser_name", "advertiser"],
          emailFields: ["email", "contact_email"],
        })
      ) {
        return Response.json({ error: "Submission not found" }, { status: 404 });
      }
    }

    return Response.json({ submission: data });
  } catch (error) {
    console.error("Error fetching submission:", error);
    return Response.json({ error: "Failed to fetch submission" }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    const isAdvertiser = isAdvertiserUser(auth.user);
    const canManageSubmission =
      can(auth.user.role, "submissions:convert") ||
      can(auth.user.role, "submissions:reject");

    if (!isAdvertiser && !canManageSubmission) {
      return Response.json(
        { error: "Unauthorized - Submission access required" },
        { status: 403 },
      );
    }

    const submissionId = String(params?.id || "").trim();
    if (!submissionId) {
      return Response.json({ error: "Submission ID is required" }, { status: 400 });
    }

    const supabase = db();
    const { data: submission, error: submissionError } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    let scope = null;
    if (isAdvertiser) {
      scope = await resolveAdvertiserScope(auth.user);
      if (
        !matchesAdvertiserScope(submission, scope, {
          advertiserNameFields: ["advertiser_name", "advertiser"],
          emailFields: ["email", "contact_email"],
        })
      ) {
        return Response.json({ error: "Submission not found" }, { status: 404 });
      }
    }

    const normalizedStatus = String(submission.status || "").trim().toLowerCase();
    const editableStatuses = isAdvertiser ? ["pending"] : ["pending", "not_approved"];
    if (!editableStatuses.includes(normalizedStatus)) {
      return Response.json(
        {
          error: isAdvertiser
            ? "Only pending submissions can be edited."
            : "Only pending or not approved submissions can be edited.",
        },
        { status: 400 },
      );
    }

    const body = await request.json();
    const nextProductId = String(body.product_id ?? submission.product_id ?? "").trim();
    let productRow = null;
    if (body.product_id !== undefined && !nextProductId) {
      return Response.json(
        { error: "Selected product is required." },
        { status: 400 },
      );
    }

    if (nextProductId) {
      const { data: product, error: productError } = await supabase
        .from(table("products"))
        .select("id, product_name, price, placement")
        .eq("id", nextProductId)
        .maybeSingle();
      if (productError) throw productError;
      if (!product) {
        return Response.json(
          { error: "Selected product was not found." },
          { status: 400 },
        );
      }
      productRow = product;
    }

    const normalizedPhoneCandidate =
      body.phone_number !== undefined
        ? normalizeUSPhoneNumber(body.phone_number || "")
        : normalizeUSPhoneNumber(submission.phone_number || submission.phone || "");
    const normalizedPhoneNumber = isCompleteUSPhoneNumber(normalizedPhoneCandidate)
      ? normalizedPhoneCandidate
      : "";

    const nextPostType = normalizePostType(body.post_type || submission.post_type || "");
    if (!["one_time", "daily_run", "custom_schedule"].includes(nextPostType)) {
      return Response.json(
        { error: "Unsupported post type." },
        { status: 400 },
      );
    }
    const nextPostDateFrom = normalizeDateOnly(body.post_date_from ?? submission.post_date_from);
    const nextPostDateTo = normalizeDateOnly(body.post_date_to ?? submission.post_date_to);
    const nextPostTime = String(body.post_time ?? submission.post_time ?? "").trim();
    const nextCustomDates = normalizeCustomDateEntries(
      body.custom_dates !== undefined ? body.custom_dates : submission.custom_dates,
    );

    if (
      !String(body.advertiser_name ?? submission.advertiser_name ?? "").trim() ||
      !String(body.contact_name ?? submission.contact_name ?? "").trim() ||
      !String(body.email ?? submission.email ?? "").trim() ||
      !String(body.ad_name ?? submission.ad_name ?? "").trim()
    ) {
      return Response.json(
        { error: "Advertiser name, contact name, email, and ad name are required." },
        { status: 400 },
      );
    }

    if (nextPostType === "one_time") {
      if (!nextPostDateFrom || !nextPostTime) {
        return Response.json(
          { error: "Post date and time are required for one-time submissions." },
          { status: 400 },
        );
      }

      const availability = await checkSingleDateAvailability({
        supabase,
        date: nextPostDateFrom,
        postType: nextPostType,
        postTime: nextPostTime,
        excludeId: submissionId,
      });

      if (!availability.available) {
        return Response.json(
          {
            error: availability.is_day_full
              ? "Ad limit reached for this date. Please choose the next available day."
              : "This time slot is already taken. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    if (nextPostType === "daily_run") {
      if (!nextPostDateFrom || !nextPostDateTo) {
        return Response.json(
          { error: "Start date and end date are required for a daily run." },
          { status: 400 },
        );
      }

      const availability = await checkBatchAvailability({
        supabase,
        dates: expandDateRange(nextPostDateFrom, nextPostDateTo),
        excludeId: submissionId,
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

    if (nextPostType === "custom_schedule") {
      if (nextCustomDates.length === 0) {
        return Response.json(
          { error: "Add at least one date for a custom schedule." },
          { status: 400 },
        );
      }

      const availability = await checkBatchAvailability({
        supabase,
        dates: nextCustomDates.map((entry) => customDateValue(entry)),
        excludeId: submissionId,
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

    const firstCustomDate = customDateValue(nextCustomDates[0]);
    const resolvedPlacement =
      productRow?.placement ||
      String(body.placement ?? submission.placement ?? "").trim() ||
      null;
    const patch = {
      advertiser_name: String(body.advertiser_name ?? submission.advertiser_name ?? "").trim(),
      contact_name: String(body.contact_name ?? submission.contact_name ?? "").trim(),
      email: String(body.email ?? submission.email ?? "").trim(),
      phone_number: normalizedPhoneNumber || null,
      phone: normalizedPhoneNumber || null,
      ad_name: String(body.ad_name ?? submission.ad_name ?? "").trim(),
      post_type: nextPostType,
      post_date:
        nextPostType === "custom_schedule"
          ? firstCustomDate || null
          : nextPostDateFrom || null,
      post_date_from:
        nextPostType === "daily_run" || nextPostType === "one_time"
          ? nextPostDateFrom || null
          : null,
      post_date_to: nextPostType === "daily_run" ? nextPostDateTo || null : null,
      custom_dates: nextCustomDates,
      post_time: nextPostType === "custom_schedule" ? null : nextPostTime || null,
      reminder_minutes: parseReminderMinutes(
        body.reminder_minutes ?? submission.reminder_minutes,
        15,
      ),
      ad_text: String(body.ad_text ?? submission.ad_text ?? "").trim(),
      product_id: productRow?.id || submission.product_id || null,
      product_name: productRow?.product_name || submission.product_name || null,
      price: productRow?.price ?? submission.price ?? 0,
      placement: resolvedPlacement,
      notes: String(body.notes ?? submission.notes ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (isAdvertiser && scope?.id) {
      patch.advertiser_id = scope.id;
    }

    const updatedSubmission = await updatePendingSubmissionRecord(supabase, submissionId, patch);
    if (!updatedSubmission) {
      return Response.json({ error: "Submission not found" }, { status: 404 });
    }

    return Response.json({
      message: "Submission updated successfully",
      submission: updatedSubmission,
    });
  } catch (error) {
    console.error("Error updating submission:", error);
    return Response.json({ error: "Failed to update submission" }, { status: 500 });
  }
}
