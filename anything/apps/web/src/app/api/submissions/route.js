import { db, table } from "../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAdminOrAdvertiser,
  resolveAdvertiserScope,
} from "../utils/auth-check.js";

const submissionPriority = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending") return 1;
  if (normalized === "not_approved") return 2;
  if (normalized === "approved") return 3;
  return 4;
};

export async function GET(request) {
  try {
    const auth = await requireAdminOrAdvertiser(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = String(searchParams.get("status") || "").trim().toLowerCase();
    const search = String(searchParams.get("search") || "").trim().toLowerCase();
    const includeApproved = searchParams.get("includeApproved") === "true";

    const supabase = db();
    const { data, error } = await supabase
      .from(table("pending_ads"))
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;

    let submissions = (data || []).filter((item) => {
      if (!includeApproved && String(item.status || "").trim().toLowerCase() === "approved") {
        return false;
      }

      if (!advertiserScope) {
        return true;
      }

      return matchesAdvertiserScope(item, advertiserScope, {
        advertiserNameFields: ["advertiser_name", "advertiser"],
        emailFields: ["email", "contact_email"],
      });
    });

    if (statusFilter && statusFilter !== "all") {
      submissions = submissions.filter(
        (item) => String(item.status || "").trim().toLowerCase() === statusFilter,
      );
    }

    if (search) {
      submissions = submissions.filter((item) => {
        const haystack = [
          item.ad_name,
          item.advertiser_name,
          item.email,
          item.post_type,
          item.notes,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(search);
      });
    }

    submissions.sort((left, right) => {
      const byPriority = submissionPriority(left.status) - submissionPriority(right.status);
      if (byPriority !== 0) {
        return byPriority;
      }

      const leftTime = new Date(left.created_at || 0).valueOf();
      const rightTime = new Date(right.created_at || 0).valueOf();
      return rightTime - leftTime;
    });

    return Response.json({ submissions });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    return Response.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }
}
