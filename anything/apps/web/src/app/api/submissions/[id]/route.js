import { db, table } from "../../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAuth,
  resolveAdvertiserScope,
} from "../../utils/auth-check.js";
import { can } from "../../../../lib/permissions.js";

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
