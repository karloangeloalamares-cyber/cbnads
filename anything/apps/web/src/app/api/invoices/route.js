import sql from "@/app/api/utils/sql";
import { auth } from "@/auth";
import { recalculateAdvertiserSpend } from "@/app/api/utils/recalculate-advertiser-spend";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const advertiser_id = searchParams.get("advertiser_id");
    const invoiceId = searchParams.get("id");

    // If an id is provided, return a single invoice with items
    if (invoiceId) {
      const invoiceResult = await sql`
        SELECT * FROM invoices 
        WHERE id = ${parseInt(invoiceId)} 
        AND deleted_at IS NULL
      `;

      if (invoiceResult.length === 0) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      const items = await sql`
        SELECT ii.*, a.ad_name, p.product_name
        FROM invoice_items ii
        LEFT JOIN ads a ON a.id = ii.ad_id
        LEFT JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = ${parseInt(invoiceId)}
        ORDER BY ii.id ASC
      `;

      return Response.json({ invoice: { ...invoiceResult[0], items } });
    }

    // Otherwise, return a list of invoices (exclude soft-deleted)
    let query = `SELECT i.*, 
      COALESCE(json_agg(
        json_build_object(
          'id', ii.id,
          'ad_id', ii.ad_id,
          'product_id', ii.product_id,
          'description', ii.description,
          'quantity', ii.quantity,
          'unit_price', ii.unit_price,
          'amount', ii.amount
        ) ORDER BY ii.id
      ) FILTER (WHERE ii.id IS NOT NULL), '[]') as items
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.deleted_at IS NULL`;

    const params = [];
    let paramCount = 0;

    if (status && status !== "All") {
      paramCount++;
      query += ` AND i.status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      const searchParam = `%${search}%`;
      query += ` AND (LOWER(i.invoice_number) LIKE LOWER($${paramCount})`;
      paramCount++;
      query += ` OR LOWER(i.advertiser_name) LIKE LOWER($${paramCount}))`;
      params.push(searchParam, searchParam);
    }

    if (advertiser_id) {
      paramCount++;
      query += ` AND i.advertiser_id = $${paramCount}`;
      params.push(parseInt(advertiser_id));
    }

    query += ` GROUP BY i.id ORDER BY i.created_at DESC`;

    console.log("Fetching invoices with query:", query);
    console.log("Query params:", params);

    const invoices = await sql(query, params);

    console.log(
      `Returning ${invoices.length} invoices (deleted_at IS NULL filter applied)`,
    );

    return Response.json({ invoices });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    return Response.json(
      { error: "Failed to fetch invoices" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return Response.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }

    const {
      advertiser_id,
      advertiser_name,
      contact_name,
      contact_email,
      bill_to,
      issue_date,
      status,
      discount,
      tax,
      notes,
      items,
      amount_paid,
    } = body;

    // Get current invoice to check for advertiser and status changes
    const currentInvoiceResult =
      await sql`SELECT status, advertiser_id, total, amount_paid FROM invoices WHERE id = ${parseInt(id)}`;
    const currentInvoice = currentInvoiceResult[0];
    const oldStatus = currentInvoice?.status;
    const oldAdvertiserId = currentInvoice?.advertiser_id;
    const invoiceTotal = currentInvoice?.total || 0;

    // Build dynamic update
    let setClauses = [];
    let values = [];
    let paramCount = 0;

    if (advertiser_id !== undefined) {
      paramCount++;
      setClauses.push(`advertiser_id = $${paramCount}`);
      values.push(advertiser_id);
    }
    if (advertiser_name !== undefined) {
      paramCount++;
      setClauses.push(`advertiser_name = $${paramCount}`);
      values.push(advertiser_name);
    }
    if (contact_name !== undefined) {
      paramCount++;
      setClauses.push(`contact_name = $${paramCount}`);
      values.push(contact_name);
    }
    if (contact_email !== undefined) {
      paramCount++;
      setClauses.push(`contact_email = $${paramCount}`);
      values.push(contact_email);
    }
    if (bill_to !== undefined) {
      paramCount++;
      setClauses.push(`bill_to = $${paramCount}`);
      values.push(bill_to);
    }
    if (issue_date !== undefined) {
      paramCount++;
      setClauses.push(`issue_date = $${paramCount}`);
      values.push(issue_date);
    }
    if (status !== undefined) {
      paramCount++;
      setClauses.push(`status = $${paramCount}`);
      values.push(status);
    }
    if (discount !== undefined) {
      paramCount++;
      setClauses.push(`discount = $${paramCount}`);
      values.push(parseFloat(discount) || 0);
    }
    if (tax !== undefined) {
      paramCount++;
      setClauses.push(`tax = $${paramCount}`);
      values.push(parseFloat(tax) || 0);
    }
    if (notes !== undefined) {
      paramCount++;
      setClauses.push(`notes = $${paramCount}`);
      values.push(notes);
    }
    if (amount_paid !== undefined) {
      paramCount++;
      setClauses.push(`amount_paid = $${paramCount}`);
      values.push(parseFloat(amount_paid) || 0);
    }

    // Recalculate total if items are being updated
    let finalTotal = invoiceTotal;
    if (items && items.length > 0) {
      let subtotal = 0;
      for (const item of items) {
        subtotal += parseFloat(item.amount) || 0;
      }
      const discountVal =
        discount !== undefined ? parseFloat(discount) || 0 : 0;
      const taxVal = tax !== undefined ? parseFloat(tax) || 0 : 0;
      finalTotal = subtotal - discountVal + taxVal;
      paramCount++;
      setClauses.push(`total = $${paramCount}`);
      values.push(finalTotal);
    }

    paramCount++;
    setClauses.push(`updated_at = $${paramCount}`);
    values.push(new Date().toISOString());

    if (setClauses.length > 0) {
      paramCount++;
      values.push(parseInt(id));
      const updateQuery = `UPDATE invoices SET ${setClauses.join(", ")} WHERE id = $${paramCount} RETURNING *`;
      await sql(updateQuery, values);
    }

    // Update items if provided
    if (items) {
      await sql`DELETE FROM invoice_items WHERE invoice_id = ${parseInt(id)}`;
      for (const item of items) {
        await sql`
          INSERT INTO invoice_items (invoice_id, ad_id, product_id, description, quantity, unit_price, amount)
          VALUES (${parseInt(id)}, ${item.ad_id || null}, ${item.product_id || null}, ${item.description}, ${item.quantity || 1}, ${parseFloat(item.unit_price) || 0}, ${parseFloat(item.amount) || 0})
        `;
      }
    }

    // BI-DIRECTIONAL SYNC: Handle invoice status changes affecting ads
    const newAmountPaid =
      amount_paid !== undefined
        ? parseFloat(amount_paid)
        : currentInvoice?.amount_paid || 0;
    const newStatus = status !== undefined ? status : oldStatus;

    // Determine if invoice is fully paid
    const isFullyPaid = newStatus === "Paid" || newAmountPaid >= finalTotal;

    // Get linked ads
    const linkedAds = await sql`
      SELECT ad_id FROM invoice_items 
      WHERE invoice_id = ${parseInt(id)} AND ad_id IS NOT NULL
    `;
    const adIds = linkedAds.map((item) => item.ad_id);

    if (adIds.length > 0) {
      if (isFullyPaid && oldStatus !== "Paid") {
        // Invoice became fully paid - mark ads as Paid
        await sql`
          UPDATE ads
          SET payment = 'Paid',
              paid_via_invoice_id = ${parseInt(id)}
          WHERE id = ANY(${adIds})
        `;
        console.log(`Marked ${adIds.length} ads as Paid for invoice ${id}`);
      } else if (!isFullyPaid && oldStatus === "Paid") {
        // Invoice changed from Paid to unpaid - restore original payment amounts
        // Get original amounts from invoice items
        for (const adId of adIds) {
          const [item] = await sql`
            SELECT unit_price FROM invoice_items 
            WHERE invoice_id = ${parseInt(id)} AND ad_id = ${adId}
            LIMIT 1
          `;
          if (item) {
            await sql`
              UPDATE ads
              SET payment = ${"$" + item.unit_price.toFixed(2)},
                  paid_via_invoice_id = NULL
              WHERE id = ${adId}
            `;
          }
        }
        console.log(
          `Restored payment amounts for ${adIds.length} ads from invoice ${id}`,
        );
      }
    }

    // Recalculate total_spend for affected advertisers
    const newAdvertiserId =
      advertiser_id !== undefined ? advertiser_id : oldAdvertiserId;

    // If status changed or advertiser changed, recalculate
    if (status !== undefined && status !== oldStatus) {
      // Status changed - recalculate for the advertiser
      if (newAdvertiserId) {
        await recalculateAdvertiserSpend(newAdvertiserId);
      }
    }

    // If advertiser changed, recalculate both old and new
    if (advertiser_id !== undefined && advertiser_id !== oldAdvertiserId) {
      if (oldAdvertiserId) {
        await recalculateAdvertiserSpend(oldAdvertiserId);
      }
      if (advertiser_id) {
        await recalculateAdvertiserSpend(advertiser_id);
      }
    }

    const updatedInvoice =
      await sql`SELECT * FROM invoices WHERE id = ${parseInt(id)}`;
    const updatedItems =
      await sql`SELECT * FROM invoice_items WHERE invoice_id = ${parseInt(id)} ORDER BY id ASC`;

    return Response.json({
      invoice: { ...updatedInvoice[0], items: updatedItems },
    });
  } catch (error) {
    console.error("Error updating invoice:", error);
    return Response.json(
      { error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    console.log("DELETE invoice request for id:", id);

    if (!id) {
      return Response.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }

    // Get invoice details and linked ads before soft-deleting
    const invoiceResult =
      await sql`SELECT advertiser_id, deleted_at FROM invoices WHERE id = ${parseInt(id)}`;
    const invoice = invoiceResult[0];

    console.log("Invoice before delete:", invoice);

    if (!invoice) {
      console.log("Invoice not found");
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.deleted_at) {
      console.log("Invoice already deleted at:", invoice.deleted_at);
    }

    const advertiserId = invoice?.advertiser_id;

    // Get linked ads
    const linkedAds = await sql`
      SELECT ad_id FROM invoice_items 
      WHERE invoice_id = ${parseInt(id)} AND ad_id IS NOT NULL
    `;
    const adIds = linkedAds.map((item) => item.ad_id);

    console.log("Linked ads:", adIds);

    // Soft delete the invoice
    const deleteResult = await sql`
      UPDATE invoices 
      SET deleted_at = ${new Date().toISOString()}
      WHERE id = ${parseInt(id)}
      RETURNING id, deleted_at
    `;

    console.log("Soft delete result:", deleteResult);

    // Clear paid_via_invoice_id from linked ads and restore payment amounts
    if (adIds.length > 0) {
      for (const adId of adIds) {
        const [item] = await sql`
          SELECT unit_price FROM invoice_items 
          WHERE invoice_id = ${parseInt(id)} AND ad_id = ${adId}
          LIMIT 1
        `;
        if (item) {
          await sql`
            UPDATE ads
            SET payment = ${"$" + item.unit_price.toFixed(2)},
                paid_via_invoice_id = NULL
            WHERE id = ${adId}
          `;
        }
      }
      console.log(`Cleared invoice reference from ${adIds.length} ads`);
    }

    // Recalculate advertiser's total_spend after deletion
    if (advertiserId) {
      await recalculateAdvertiserSpend(advertiserId);
    }

    console.log("DELETE completed successfully");
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return Response.json(
      { error: "Failed to delete invoice" },
      { status: 500 },
    );
  }
}
