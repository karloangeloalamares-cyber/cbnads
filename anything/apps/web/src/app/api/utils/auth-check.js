import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

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

  // Fetch user role from database
  const userRows = await sql`
    SELECT role FROM auth_users WHERE id = ${session.user.id}
  `;

  if (userRows.length === 0 || userRows[0].role !== "admin") {
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
