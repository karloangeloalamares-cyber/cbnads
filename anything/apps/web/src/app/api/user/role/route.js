import sql from "../../utils/sql";
import { auth } from "../../../../auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const databaseEnabled =
      process.env.CBN_ENABLE_DATABASE === "true" &&
      Boolean(process.env.DATABASE_URL);

    if (!databaseEnabled) {
      return Response.json({
        user: {
          id: session.user.id,
          name: session.user.name ?? "Local Admin",
          email: session.user.email ?? null,
          image: session.user.image ?? null,
          role: "admin",
        },
      });
    }

    const userId = session.user.id;
    const rows =
      await sql`SELECT id, name, email, image, role FROM auth_users WHERE id = ${userId} LIMIT 1`;
    const user = rows?.[0] || null;

    return Response.json({ user });
  } catch (err) {
    console.error("GET /api/user/role error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
