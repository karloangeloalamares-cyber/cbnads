import { db, table } from "../../utils/supabase-db.js";
import { getSessionUser, requireAdmin } from "../../utils/auth-check.js";

// Get all admin members
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { data: rows, error } = await supabase
      .from(table("team_members"))
      .select("id, name, email, role")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const members = (rows || []).map((member) => ({
      ...member,
      image: null,
    }));

    const currentUser = await getSessionUser();
    if (currentUser?.email) {
      const exists = members.some(
        (member) =>
          String(member.email || "").trim().toLowerCase() ===
          String(currentUser.email || "").trim().toLowerCase(),
      );
      if (!exists && String(currentUser.role || "") === "admin") {
        members.unshift({
          id: currentUser.id || "session-admin",
          name: currentUser.name || currentUser.email,
          email: currentUser.email,
          image: currentUser.image || null,
          role: "admin",
        });
      }
    }

    return Response.json({ members });
  } catch (err) {
    console.error("GET /api/admin/members error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Add a new admin member
export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const body = await request.json();
    const { email, name } = body;

    if (!email) {
      return Response.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    const supabase = db();
    const normalizedEmail = String(email).trim().toLowerCase();

    const { data: existing, error: existingError } = await supabase
      .from(table("team_members"))
      .select("id, role")
      .ilike("email", normalizedEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      if (String(existing.role || "").toLowerCase() === "admin") {
        return Response.json(
          { error: "A user with this email already exists" },
          { status: 400 },
        );
      }

      const { error: promoteError } = await supabase
        .from(table("team_members"))
        .update({
          role: "admin",
          name: name || normalizedEmail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (promoteError) throw promoteError;
    } else {
      const nowIso = new Date().toISOString();
      const { error: insertError } = await supabase
        .from(table("team_members"))
        .insert({
          name: name || normalizedEmail,
          email: normalizedEmail,
          role: "admin",
          created_at: nowIso,
          updated_at: nowIso,
        });
      if (insertError) throw insertError;
    }

    return Response.json({
      success: true,
      message: "Admin user created successfully",
    });
  } catch (err) {
    console.error("POST /api/admin/members error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
