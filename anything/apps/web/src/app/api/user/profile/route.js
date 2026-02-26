import { db, table } from "@/app/api/utils/supabase-db";
import { getSessionUser, requireAuth } from "@/app/api/utils/auth-check";

// Update user profile
export async function PUT(request) {
  try {
    const authState = await requireAuth();
    if (!authState.authorized) {
      return Response.json({ error: authState.error }, { status: 401 });
    }

    const body = await request.json();
    const { name, image } = body;

    if (name === undefined && image === undefined) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const currentUser = await getSessionUser();
    if (!currentUser?.email) {
      return Response.json(
        { error: "User session is missing email" },
        { status: 400 },
      );
    }

    const supabase = db();
    const normalizedEmail = String(currentUser.email).trim().toLowerCase();

    const { data: member, error: memberError } = await supabase
      .from(table("team_members"))
      .select("id, role")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (memberError) throw memberError;

    if (name !== undefined) {
      if (member?.id) {
        const { error: updateError } = await supabase
          .from(table("team_members"))
          .update({
            name: name || normalizedEmail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", member.id);
        if (updateError) throw updateError;
      } else {
        const nowIso = new Date().toISOString();
        const { error: insertError } = await supabase.from(table("team_members")).insert({
          name: name || normalizedEmail,
          email: normalizedEmail,
          role: currentUser.role === "admin" ? "admin" : "member",
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (insertError) throw insertError;
      }
    }

    const role = member?.role || (currentUser.role === "admin" ? "admin" : "user");
    return Response.json({
      success: true,
      user: {
        id: currentUser.id,
        name: name !== undefined ? name : currentUser.name,
        email: currentUser.email,
        image: image !== undefined ? image : currentUser.image || null,
        role,
      },
    });
  } catch (err) {
    console.error("PUT /api/user/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
