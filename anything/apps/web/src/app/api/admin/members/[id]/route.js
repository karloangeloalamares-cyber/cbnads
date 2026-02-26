import { db, table } from "@/app/api/utils/supabase-db";
import { getSessionUser, requireAdmin } from "@/app/api/utils/auth-check";

// Remove admin role from a member
export async function DELETE(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const memberId = params?.id;
    if (!memberId) {
      return Response.json({ error: "Member ID is required" }, { status: 400 });
    }

    const currentUser = await getSessionUser();
    const supabase = db();

    const { data: member, error: memberError } = await supabase
      .from(table("team_members"))
      .select("id, email")
      .eq("id", memberId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    const sameAsCurrentById =
      currentUser?.id && String(currentUser.id) === String(member.id);
    const sameAsCurrentByEmail =
      currentUser?.email &&
      String(currentUser.email).trim().toLowerCase() ===
        String(member.email || "").trim().toLowerCase();
    if (sameAsCurrentById || sameAsCurrentByEmail) {
      return Response.json(
        { error: "You cannot remove yourself" },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from(table("team_members"))
      .update({
        role: "member",
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId);
    if (updateError) throw updateError;

    return Response.json({
      success: true,
      message: "Admin role removed successfully",
    });
  } catch (err) {
    console.error("DELETE /api/admin/members/[id] error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

