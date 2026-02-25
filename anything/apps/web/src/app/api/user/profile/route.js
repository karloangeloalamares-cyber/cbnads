import sql from "../../utils/sql";
import { auth } from "../../../../auth";

// Update user profile
export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, image } = body;

    // At least one field must be provided
    if (name === undefined && image === undefined) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }

    if (image !== undefined) {
      updates.push(`image = $${paramIndex}`);
      values.push(image);
      paramIndex++;
    }

    // Add user ID as the last parameter
    values.push(session.user.id);

    const query = `
      UPDATE auth_users
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, image, role
    `;

    const result = await sql(query, values);

    if (!result || result.length === 0) {
      return Response.json(
        { error: "Failed to update profile" },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      user: result[0],
    });
  } catch (err) {
    console.error("PUT /api/user/profile error", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
