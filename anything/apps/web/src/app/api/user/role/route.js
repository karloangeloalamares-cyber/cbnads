import { getSessionUser, requireAuth } from "../../utils/auth-check.js";

export async function GET(request) {
  try {
    const authState = await requireAuth(request);
    if (!authState.authorized) {
      return Response.json({ error: authState.error }, { status: 401 });
    }

    const user = await getSessionUser(request);
    return Response.json({
      user: user
        ? {
            id: user.id,
            name: user.name || null,
            email: user.email || null,
            image: user.image || null,
            role: user.role || "user",
            advertiser_id: user.advertiser_id || null,
            advertiser_name: user.advertiser_name || null,
          }
        : null,
    });
  } catch (err) {
    console.error("GET /api/user/role error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
