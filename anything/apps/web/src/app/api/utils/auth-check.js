import { auth } from "@/auth";
import { db, table } from "@/app/api/utils/supabase-db";

async function resolveUserRole(sessionUser) {
  const rawRole = String(sessionUser?.role || "").trim().toLowerCase();
  if (rawRole) return rawRole;

  const email = String(sessionUser?.email || "").trim().toLowerCase();
  if (!email) return "user";

  try {
    const supabase = db();
    const { data, error } = await supabase
      .from(table("team_members"))
      .select("role")
      .ilike("email", email)
      .maybeSingle();
    if (error) throw error;
    return String(data?.role || "user").trim().toLowerCase();
  } catch {
    return "user";
  }
}

/**
 * Check if the current user is authenticated and is an admin
 * @returns {Promise<{authorized: boolean, user?: object, error?: string}>}
 */
export async function requireAdmin() {
  const session = await auth();

  if (!session || !session.user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
    };
  }

  const role = await resolveUserRole(session.user);
  if (role !== "admin") {
    return {
      authorized: false,
      error: "Unauthorized - Admin access required",
    };
  }

  return {
    authorized: true,
    user: session.user,
  };
}

/**
 * Check if the current user is authenticated (doesn't check role)
 * @returns {Promise<{authorized: boolean, user?: object, error?: string}>}
 */
export async function requireAuth() {
  const session = await auth();

  if (!session || !session.user?.id) {
    return {
      authorized: false,
      error: "Unauthorized - Please sign in",
    };
  }

  return {
    authorized: true,
    user: session.user,
  };
}

export async function getSessionUser() {
  const session = await auth();
  if (!session || !session.user?.id) return null;

  const role = await resolveUserRole(session.user);
  return {
    ...session.user,
    role,
  };
}
