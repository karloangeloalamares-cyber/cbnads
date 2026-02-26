import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      advertiser_name,
      contact_name,
      email,
      phone_number,
      status = "active",
    } = body;

    if (!advertiser_name || !contact_name) {
      return Response.json(
        { error: "Advertiser name and contact name are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO advertisers (
        advertiser_name,
        contact_name,
        email,
        phone_number,
        status
      ) VALUES (
        ${advertiser_name},
        ${contact_name},
        ${email || null},
        ${phone_number || null},
        ${status}
      )
      RETURNING *
    `;

    return Response.json({ advertiser: result[0] });
  } catch (error) {
    console.error("Error creating advertiser:", error);
    return Response.json(
      { error: "Failed to create advertiser" },
      { status: 500 },
    );
  }
}
