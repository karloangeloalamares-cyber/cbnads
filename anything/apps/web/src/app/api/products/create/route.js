import sql from "@/app/api/utils/sql";

export async function POST(request) {
  try {
    const body = await request.json();
    const { product_name, placement, price } = body;

    if (!product_name || !placement || price === undefined) {
      return Response.json(
        { error: "Product name, placement, and price are required" },
        { status: 400 },
      );
    }

    const result = await sql`
      INSERT INTO products (product_name, placement, price)
      VALUES (${product_name}, ${placement}, ${price})
      RETURNING *
    `;

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error creating product:", error);
    return Response.json(
      { error: "Failed to create product" },
      { status: 500 },
    );
  }
}
