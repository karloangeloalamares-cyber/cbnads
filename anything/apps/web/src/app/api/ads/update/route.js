import sql from "@/app/api/utils/sql";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function PUT(request) {
  try {
    const body = await request.json();
    console.log("[Update Ad] Request body:", JSON.stringify(body, null, 2));

    const {
      id,
      ad_name,
      advertiser,
      status,
      post_type,
      placement,
      schedule,
      payment,
      product_id,
      post_date_from,
      post_date_to,
      custom_dates,
      media,
      ad_text,
      post_time,
      reminder_minutes,
    } = body;

    if (!id) {
      console.error("[Update Ad] No ID provided");
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    // Get the old ad data before updating
    const oldAdResult =
      await sql`SELECT advertiser, status, payment, paid_via_invoice_id FROM ads WHERE id = ${id}`;
    const oldAdvertiser = oldAdResult[0]?.advertiser;
    const oldStatus = oldAdResult[0]?.status;
    const oldPayment = oldAdResult[0]?.payment;
    const oldInvoiceId = oldAdResult[0]?.paid_via_invoice_id;

    // Check if time-related fields are being updated
    const timeFieldsUpdated =
      post_time !== undefined ||
      schedule !== undefined ||
      post_date_from !== undefined ||
      post_date_to !== undefined ||
      custom_dates !== undefined;

    // If time fields are updated, delete old reminder records so new ones can be sent
    if (timeFieldsUpdated) {
      console.log(
        "[Update Ad] Time fields updated - deleting old reminder records for ad ID:",
        id,
      );
      await sql`
        DELETE FROM sent_reminders
        WHERE ad_id = ${id}
      `;
      console.log(
        "[Update Ad] Old reminder records deleted - new reminders will be sent",
      );
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (ad_name !== undefined) {
      updates.push(`ad_name = $${paramCount}`);
      values.push(ad_name);
      paramCount++;
    }
    if (advertiser !== undefined) {
      updates.push(`advertiser = $${paramCount}`);
      values.push(advertiser);
      paramCount++;
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;

      // If changing to Published and not already Published, set published_at
      if (status === "Published" && oldStatus !== "Published") {
        updates.push(`published_at = NOW()`);
      }
    }
    if (post_type !== undefined) {
      updates.push(`post_type = $${paramCount}`);
      values.push(post_type);
      paramCount++;
    }
    if (placement !== undefined) {
      updates.push(`placement = $${paramCount}`);
      values.push(placement);
      paramCount++;
    }

    // Always update schedule field, even if null
    updates.push(`schedule = $${paramCount}`);
    values.push(schedule || null);
    paramCount++;

    if (payment !== undefined) {
      updates.push(`payment = $${paramCount}`);
      values.push(payment);
      paramCount++;

      // If marking as Paid without existing invoice, keep it paid but no invoice reference
      // If changing FROM Paid to something else, clear the invoice reference
      if (payment !== "Paid" && oldPayment === "Paid") {
        updates.push(`paid_via_invoice_id = NULL`);
      }
    }
    if (product_id !== undefined) {
      updates.push(`product_id = $${paramCount}`);
      values.push(product_id);
      paramCount++;
    }

    // Always update post_date_from, even if null
    updates.push(`post_date_from = $${paramCount}`);
    values.push(post_date_from || null);
    paramCount++;

    // Always update post_date_to, even if null
    updates.push(`post_date_to = $${paramCount}`);
    values.push(post_date_to || null);
    paramCount++;

    // Always update custom_dates, even if empty/null
    updates.push(`custom_dates = $${paramCount}`);
    values.push(
      custom_dates && custom_dates.length > 0
        ? JSON.stringify(custom_dates)
        : null,
    );
    paramCount++;

    if (media !== undefined) {
      updates.push(`media = $${paramCount}`);
      values.push(JSON.stringify(media));
      paramCount++;
    }
    if (ad_text !== undefined) {
      updates.push(`ad_text = $${paramCount}`);
      values.push(ad_text);
      paramCount++;
    }

    if (post_time !== undefined) {
      updates.push(`post_time = $${paramCount}`);
      values.push(post_time || null);
      paramCount++;
    }

    if (reminder_minutes !== undefined) {
      updates.push(`reminder_minutes = $${paramCount}`);
      values.push(reminder_minutes);
      paramCount++;
    }

    if (updates.length === 0) {
      console.error("[Update Ad] No fields to update");
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const updateQuery = `UPDATE ads SET ${updates.join(", ")} WHERE id = $${paramCount} RETURNING *, post_time::TEXT as post_time`;

    console.log("[Update Ad] Query:", updateQuery);
    console.log("[Update Ad] Values:", values);

    const result = await sql(updateQuery, values);

    console.log("[Update Ad] Result:", result);

    if (result.length === 0) {
      console.error("[Update Ad] Ad not found with ID:", id);
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    // BI-DIRECTIONAL SYNC: Handle ad payment changes affecting invoice
    if (payment !== undefined && payment !== oldPayment) {
      // Check if this ad is part of an invoice
      const linkedInvoice = await sql`
        SELECT i.id, i.status, i.total, i.amount_paid
        FROM invoices i
        INNER JOIN invoice_items ii ON ii.invoice_id = i.id
        WHERE ii.ad_id = ${id}
          AND i.deleted_at IS NULL
        LIMIT 1
      `;

      if (linkedInvoice.length > 0) {
        const invoice = linkedInvoice[0];

        if (payment === "Paid" && invoice.status !== "Paid") {
          // Ad marked as paid - check if all ads in invoice are now paid
          const allAdsInInvoice = await sql`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN a.payment = 'Paid' THEN 1 ELSE 0 END) as paid_count
            FROM invoice_items ii
            INNER JOIN ads a ON a.id = ii.ad_id
            WHERE ii.invoice_id = ${invoice.id}
              AND ii.ad_id IS NOT NULL
          `;

          const { total, paid_count } = allAdsInInvoice[0];

          if (parseInt(paid_count) === parseInt(total)) {
            // All ads paid - mark invoice as paid
            await sql`
              UPDATE invoices
              SET status = 'Paid',
                  amount_paid = total
              WHERE id = ${invoice.id}
            `;
            console.log(
              `Invoice ${invoice.id} marked as Paid - all ads are paid`,
            );
          } else {
            // Partial payment - update amount_paid
            const paidAmount = await sql`
              SELECT COALESCE(SUM(ii.unit_price), 0) as paid_sum
              FROM invoice_items ii
              INNER JOIN ads a ON a.id = ii.ad_id
              WHERE ii.invoice_id = ${invoice.id}
                AND a.payment = 'Paid'
            `;

            await sql`
              UPDATE invoices
              SET amount_paid = ${paidAmount[0].paid_sum},
                  status = 'Partial'
              WHERE id = ${invoice.id}
            `;
            console.log(`Invoice ${invoice.id} status updated to Partial`);
          }

          // Set the invoice reference
          await sql`
            UPDATE ads
            SET paid_via_invoice_id = ${invoice.id}
            WHERE id = ${id}
          `;
        } else if (payment !== "Paid" && oldPayment === "Paid") {
          // Ad changed from Paid to unpaid - update invoice
          const paidAmount = await sql`
            SELECT COALESCE(SUM(ii.unit_price), 0) as paid_sum
            FROM invoice_items ii
            INNER JOIN ads a ON a.id = ii.ad_id
            WHERE ii.invoice_id = ${invoice.id}
              AND a.payment = 'Paid'
              AND a.id != ${id}
          `;

          const newPaidAmount = parseFloat(paidAmount[0].paid_sum);

          if (newPaidAmount === 0) {
            // No ads paid - mark as Pending
            await sql`
              UPDATE invoices
              SET status = 'Pending',
                  amount_paid = 0
              WHERE id = ${invoice.id}
            `;
            console.log(
              `Invoice ${invoice.id} marked as Pending - no ads paid`,
            );
          } else if (newPaidAmount < invoice.total) {
            // Partial payment
            await sql`
              UPDATE invoices
              SET status = 'Partial',
                  amount_paid = ${newPaidAmount}
              WHERE id = ${invoice.id}
            `;
            console.log(`Invoice ${invoice.id} status updated to Partial`);
          }
        }
      }
    }

    // Update next_ad_date for both old and new advertisers (if advertiser changed)
    const newAdvertiser = advertiser !== undefined ? advertiser : oldAdvertiser;

    if (oldAdvertiser) {
      await updateAdvertiserNextAdDate(oldAdvertiser);
    }

    // If advertiser changed, update the new one too
    if (newAdvertiser && newAdvertiser !== oldAdvertiser) {
      await updateAdvertiserNextAdDate(newAdvertiser);
    }

    return Response.json({ ad: result[0] });
  } catch (error) {
    console.error("[Update Ad] Error:", error);
    console.error("[Update Ad] Error stack:", error.stack);
    return Response.json(
      {
        error: "Failed to update ad",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
