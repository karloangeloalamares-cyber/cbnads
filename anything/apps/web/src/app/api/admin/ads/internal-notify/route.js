import { db, table } from "../../../utils/supabase-db.js";
import { requireInternalUser } from "../../../utils/auth-check.js";
import { notifyInternalChannels } from "../../../utils/internal-notification-channels.js";

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeEvent = (value) => {
  const event = String(value || "").trim().toLowerCase();
  if (["created", "updated", "published", "deleted", "archived"].includes(event)) {
    return event;
  }
  return "updated";
};

const EVENT_LABELS = {
  created: "Ad Created",
  updated: "Ad Updated",
  published: "Ad Published",
  deleted: "Ad Deleted",
  archived: "Ad Archived",
};
const ENABLED_NOTIFICATION_EVENTS = new Set(["published"]);

const toValue = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const buildInternalEmailHtml = ({
  eventLabel,
  adName,
  advertiserName,
  status,
  postType,
  placement,
  postDateFrom,
  postDateTo,
  postTime,
  actorName,
  actorEmail,
}) => `
  <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
    <div style="max-width: 560px; margin: 0 auto; padding: 24px 20px;">
      <h2 style="margin: 0 0 16px;">${escapeHtml(eventLabel)}</h2>
      <p style="margin: 0 0 8px;"><strong>Ad:</strong> ${escapeHtml(adName)}</p>
      ${advertiserName ? `<p style="margin: 0 0 8px;"><strong>Advertiser:</strong> ${escapeHtml(advertiserName)}</p>` : ""}
      ${status ? `<p style="margin: 0 0 8px;"><strong>Status:</strong> ${escapeHtml(status)}</p>` : ""}
      ${postType ? `<p style="margin: 0 0 8px;"><strong>Post Type:</strong> ${escapeHtml(postType)}</p>` : ""}
      ${placement ? `<p style="margin: 0 0 8px;"><strong>Placement:</strong> ${escapeHtml(placement)}</p>` : ""}
      ${postDateFrom ? `<p style="margin: 0 0 8px;"><strong>Start Date:</strong> ${escapeHtml(postDateFrom)}</p>` : ""}
      ${postDateTo ? `<p style="margin: 0 0 8px;"><strong>End Date:</strong> ${escapeHtml(postDateTo)}</p>` : ""}
      ${postTime ? `<p style="margin: 0 0 8px;"><strong>Post Time:</strong> ${escapeHtml(postTime)}</p>` : ""}
      ${actorName || actorEmail ? `<p style="margin: 0;"><strong>Updated by:</strong> ${escapeHtml(toValue(actorName, actorEmail))}${actorName && actorEmail ? ` (${escapeHtml(actorEmail)})` : ""}</p>` : ""}
    </div>
  </div>
`;

export async function POST(request) {
  try {
    const auth = await requireInternalUser(request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 403 });
    }

    const body = await request.json();
    const event = normalizeEvent(body?.event);
    const eventLabel = EVENT_LABELS[event];
    const adId = String(body?.ad_id || "").trim();

    if (!ENABLED_NOTIFICATION_EVENTS.has(event)) {
      return Response.json({
        success: true,
        skipped: true,
        event,
        ad_id: adId || null,
        message: `Lifecycle notifications are disabled for "${event}" events.`,
        internal_notifications: {
          email_sent: false,
          telegram_sent: false,
          email_recipients: 0,
          telegram_recipients: 0,
          email_error: null,
          telegram_error: null,
        },
      });
    }

    const supabase = db();
    let adRow = null;
    if (adId) {
      const { data, error } = await supabase
        .from(table("ads"))
        .select(
          "id, ad_name, advertiser, status, post_type, placement, post_date_from, post_date_to, post_time",
        )
        .eq("id", adId)
        .maybeSingle();
      if (error) throw error;
      adRow = data || null;
    }

    const adName = toValue(body?.ad_name, adRow?.ad_name, "Untitled ad");
    const advertiserName = toValue(body?.advertiser_name, adRow?.advertiser);
    const status = toValue(body?.status, adRow?.status);
    const postType = toValue(body?.post_type, adRow?.post_type);
    const placement = toValue(body?.placement, adRow?.placement);
    const postDateFrom = toValue(body?.post_date_from, adRow?.post_date_from);
    const postDateTo = toValue(body?.post_date_to, adRow?.post_date_to);
    const postTime = toValue(body?.post_time, adRow?.post_time);
    const actorName = toValue(body?.actor_name, auth?.user?.name);
    const actorEmail = toValue(body?.actor_email, auth?.user?.email);

    const internalNotification = await notifyInternalChannels({
      supabase,
      emailSubject: `${eventLabel} - ${adName}`,
      emailHtml: buildInternalEmailHtml({
        eventLabel,
        adName,
        advertiserName,
        status,
        postType,
        placement,
        postDateFrom,
        postDateTo,
        postTime,
        actorName,
        actorEmail,
      }),
      telegramText: [
        `<b>${escapeHtml(eventLabel)}</b>`,
        "",
        `<b>Ad:</b> ${escapeHtml(adName)}`,
        advertiserName ? `<b>Advertiser:</b> ${escapeHtml(advertiserName)}` : "",
        status ? `<b>Status:</b> ${escapeHtml(status)}` : "",
        postType ? `<b>Post Type:</b> ${escapeHtml(postType)}` : "",
        placement ? `<b>Placement:</b> ${escapeHtml(placement)}` : "",
        postDateFrom ? `<b>Start Date:</b> ${escapeHtml(postDateFrom)}` : "",
        postDateTo ? `<b>End Date:</b> ${escapeHtml(postDateTo)}` : "",
        postTime ? `<b>Post Time:</b> ${escapeHtml(postTime)}` : "",
        actorName || actorEmail
          ? `<b>Updated by:</b> ${escapeHtml(toValue(actorName, actorEmail))}${
            actorName && actorEmail ? ` (${escapeHtml(actorEmail)})` : ""
          }`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    return Response.json({
      success: true,
      event,
      ad_id: adId || adRow?.id || null,
      internal_notifications: {
        email_sent: internalNotification.email_sent,
        telegram_sent: internalNotification.telegram_sent,
        email_recipients: internalNotification.emails.length,
        telegram_recipients: internalNotification.telegram_chat_ids.length,
        email_error: internalNotification.email_error,
        telegram_error: internalNotification.telegram_error,
      },
    });
  } catch (error) {
    console.error("[admin/ads/internal-notify] Failed:", error);
    return Response.json(
      { error: error?.message || "Failed to send ad lifecycle notification." },
      { status: 500 },
    );
  }
}
