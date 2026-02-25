import sql from "../../../utils/sql";
import { auth } from "../../../../../auth";

// Remove admin role from a member
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if current user is admin
    const currentUserRows =
      await sql`SELECT role FROM auth_users WHERE id = ${session.user.id} LIMIT 1`;
    const currentUser = currentUserRows?.[0];

    if (currentUser?.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    const memberId = params.id;

    // Prevent removing yourself
    if (memberId === session.user.id) {
      return Response.json(
        { error: "You cannot remove yourself" },
        { status: 400 },
      );
    }

    // Demote user from admin to regular user
    await sql`UPDATE auth_users SET role = 'user' WHERE id = ${memberId}`;

    return Response.json({
      success: true,
      message: "Admin role removed successfully",
    });
  } catch (err) {
    console.error("DELETE /api/admin/members/[id] error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
