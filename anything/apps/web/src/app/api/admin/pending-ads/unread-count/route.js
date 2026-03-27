import { db, table } from "../../../utils/supabase-db.js";
import { requirePermission } from "../../../utils/auth-check.js";
import { hasSupabaseAdminConfig } from "../../../../../lib/supabaseAdmin.js";

const UPSTREAM_ERROR_STATUSES = new Set([502, 503, 504]);
const MAX_ERROR_MESSAGE_LENGTH = 240;

const getErrorStatus = (error) => {
  const status = Number(error?.status || error?.statusCode || 0);
  return Number.isFinite(status) ? status : 0;
};

const normalizeErrorMessage = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const summarizeErrorMessage = (error) => {
  const normalized = normalizeErrorMessage(error?.message || error || "");
  if (!normalized) {
    return "Unknown error";
  }
  if (normalized.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`;
};

const isRecoverableUnreadCountError = (error) => {
  const status = getErrorStatus(error);
  const code = String(error?.code || "").trim();
  const message = summarizeErrorMessage(error);
  return (
    !hasSupabaseAdminConfig ||
    UPSTREAM_ERROR_STATUSES.has(status) ||
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    /bad gateway/i.test(message) ||
    /cloudflare/i.test(message) ||
    /timed out/i.test(message) ||
    /timeout/i.test(message) ||
    /network/i.test(message) ||
    /fetch failed/i.test(message) ||
    /upstream/i.test(message) ||
    /does not exist/i.test(message) ||
    /Supabase admin is not configured/i.test(message)
  );
};

const getUnreadCountErrorLogContext = (error) => ({
  status: getErrorStatus(error) || null,
  code: String(error?.code || "").trim() || null,
  recoverable: isRecoverableUnreadCountError(error),
  message: summarizeErrorMessage(error),
});

export async function GET(request) {
  try {
    if (!hasSupabaseAdminConfig) {
      return Response.json({ count: 0, degraded: true });
    }

    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
    const { count, error } = await supabase
      .from(table("pending_ads"))
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "Pending"])
      .eq("viewed_by_admin", false);

    if (error) throw error;

    return Response.json({ count: Number(count) || 0 });
  } catch (error) {
    const logContext = getUnreadCountErrorLogContext(error);
    const log = logContext.recoverable ? console.warn : console.error;
    log("GET /api/admin/pending-ads/unread-count error", logContext);
    return Response.json({
      count: 0,
      degraded: true,
      recoverable: logContext.recoverable,
    });
  }
}
