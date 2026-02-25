import sql from "../../utils/sql";
import { auth } from "../../../../auth";

// PUT - Update product
export async function PUT(request, { params }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json();
    const { product_name, placement, price, update_unpaid_invoices } = body;

    if (!product_name || !placement || price === undefined) {
      return Response.json(
        { error: "Product name, placement, and price are required" },
        { status: 400 },
      );
    }

    // Get current product to check for price changes
    const currentProduct =
      await sql`SELECT price FROM products WHERE id = ${id}`;

    if (currentProduct.length === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const oldPrice = parseFloat(currentProduct[0].price);
    const newPrice = parseFloat(price);

    // If price changed, check for unpaid invoices using this product
    if (oldPrice !== newPrice) {
      const unpaidInvoices = await sql`
        SELECT COUNT(DISTINCT i.id) as count
        FROM invoices i
        INNER JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE ii.product_id = ${id}
        AND i.status != 'Paid'
      `;

      const unpaidCount = parseInt(unpaidInvoices[0]?.count || 0);

      // If there are unpaid invoices and we're not explicitly updating them, return a warning
      if (unpaidCount > 0 && !update_unpaid_invoices) {
        return Response.json(
          {
            warning: true,
            message: `${unpaidCount} unpaid invoice${unpaidCount > 1 ? "s" : ""} use${unpaidCount === 1 ? "s" : ""} the old price of $${oldPrice.toFixed(2)}. Would you like to update them to the new price of $${newPrice.toFixed(2)}?`,
            unpaidCount,
            oldPrice,
            newPrice,
          },
          { status: 200 },
        );
      }

      // If we should update unpaid invoices, do it
      if (update_unpaid_invoices && unpaidCount > 0) {
        // Update all invoice items with this product in unpaid invoices
        await sql`
          UPDATE invoice_items
          SET unit_price = ${newPrice},
              amount = quantity * ${newPrice}
          WHERE product_id = ${id}
          AND invoice_id IN (
            SELECT id FROM invoices WHERE status != 'Paid'
          )
        `;

        // Recalculate totals for affected invoices
        const affectedInvoices = await sql`
          SELECT DISTINCT i.id, i.discount, i.tax
          FROM invoices i
          INNER JOIN invoice_items ii ON ii.invoice_id = i.id
          WHERE ii.product_id = ${id}
          AND i.status != 'Paid'
        `;

        for (const invoice of affectedInvoices) {
          const items = await sql`
            SELECT SUM(amount) as subtotal
            FROM invoice_items
            WHERE invoice_id = ${invoice.id}
          `;
          const subtotal = parseFloat(items[0]?.subtotal || 0);
          const total =
            subtotal -
            parseFloat(invoice.discount || 0) +
            parseFloat(invoice.tax || 0);

          await sql`
            UPDATE invoices
            SET total = ${total}
            WHERE id = ${invoice.id}
          `;
        }
      }
    }

    const result = await sql`
      UPDATE products
      SET
        product_name = ${product_name},
        placement = ${placement},
        price = ${price}
      WHERE id = ${id}
      RETURNING *
    `;

    return Response.json(result[0]);
  } catch (error) {
    console.error("Error updating product:", error);
    return Response.json(
      { error: "Failed to update product" },
      { status: 500 },
    );
  }
}

// DELETE - Delete product
export async function DELETE(request, { params }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== "admin") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    // Check if product is used in ads or invoices
    const adsUsage = await sql`
      SELECT COUNT(*) as count FROM ads WHERE product_id = ${id} AND status != 'Published'
    `;

    const invoiceUsage = await sql`
      SELECT COUNT(*) as count FROM invoice_items WHERE product_id = ${id}
    `;

    const adsCount = parseInt(adsUsage[0]?.count || 0);
    const invoiceCount = parseInt(invoiceUsage[0]?.count || 0);

    // If product is in use and not forced, return warning
    if ((adsCount > 0 || invoiceCount > 0) && !force) {
      return Response.json(
        {
          warning: true,
          message: `This product is used in ${adsCount} non-published ad${adsCount !== 1 ? "s" : ""} and ${invoiceCount} invoice item${invoiceCount !== 1 ? "s" : ""}. Delete anyway?`,
          adsCount,
          invoiceCount,
        },
        { status: 200 },
      );
    }

    const result = await sql`
      DELETE FROM products WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting product:", error);
    return Response.json(
      { error: "Failed to delete product" },
      { status: 500 },
    );
  }
}
