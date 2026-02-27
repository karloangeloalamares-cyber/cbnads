import { getSessionUser, requireAuth } from "../../utils/auth-check.js";

export async function GET() {
  try {
    const authState = await requireAuth();
    if (!authState.authorized) {
      return Response.json({ error: authState.error }, { status: 401 });
    }

    const user = await getSessionUser();
    return Response.json({
      user: user
        ? {
            id: user.id,
            name: user.name || null,
            email: user.email || null,
            image: user.image || null,
            role: user.role || "user",
          }
        : null,
    });
  } catch (err) {
    console.error("GET /api/user/role error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

