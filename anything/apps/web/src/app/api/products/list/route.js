import sql from "../../utils/sql";

export async function GET() {
  try {
    const products = await sql`
      SELECT * FROM products
      ORDER BY created_at DESC
    `;

    return Response.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return Response.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }
}
