import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { hash } from "argon2";

// Get all admin members
export async function GET() {
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

    // Get all admin users
    const members =
      await sql`SELECT id, name, email, image, role FROM auth_users WHERE role = 'admin' ORDER BY id`;

    return Response.json({ members });
  } catch (err) {
    console.error("GET /api/admin/members error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Add a new admin member
export async function POST(request) {
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

    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUserRows =
      await sql`SELECT id FROM auth_users WHERE email = ${email} LIMIT 1`;

    if (existingUserRows && existingUserRows.length > 0) {
      return Response.json(
        { error: "A user with this email already exists" },
        { status: 400 },
      );
    }

    // Create new user
    const newUserRows = await sql`
      INSERT INTO auth_users (name, email, role)
      VALUES (${name || email}, ${email}, 'admin')
      RETURNING id
    `;
    const newUser = newUserRows?.[0];

    if (!newUser) {
      return Response.json({ error: "Failed to create user" }, { status: 500 });
    }

    // Hash password and create credentials account
    const hashedPassword = await hash(password);
    await sql`
      INSERT INTO auth_accounts ("userId", provider, type, "providerAccountId", password)
      VALUES (${newUser.id}, 'credentials', 'credentials', ${newUser.id}, ${hashedPassword})
    `;

    return Response.json({
      success: true,
      message: "Admin user created successfully",
    });
  } catch (err) {
    console.error("POST /api/admin/members error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
