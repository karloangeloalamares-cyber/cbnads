import { db, table, toNumber } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

// PUT - Update product
export async function PUT(request, { params }) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;
    const body = await request.json();
    const { product_name, placement, price, update_unpaid_invoices } = body;

    if (!product_name || price === undefined) {
      return Response.json(
        { error: "Product name and price are required" },
        { status: 400 },
      );
    }

    const newPrice = toNumber(price, 0);

    const { data: currentProduct, error: currentProductError } = await supabase
      .from(table("products"))
      .select("id, price")
      .eq("id", id)
      .maybeSingle();

    if (currentProductError) throw currentProductError;
    if (!currentProduct) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const oldPrice = toNumber(currentProduct.price, 0);

    // Optional invoice item update warning flow
    if (oldPrice !== newPrice) {
      const { data: invoiceItems, error: invoiceItemsError } = await supabase
        .from(table("invoice_items"))
        .select("invoice_id")
        .eq("product_id", id);
      if (invoiceItemsError) throw invoiceItemsError;

      const invoiceIds = Array.from(new Set((invoiceItems || []).map((row) => row.invoice_id)));

      let unpaidInvoiceIds = [];
      if (invoiceIds.length > 0) {
        const { data: invoices, error: invoicesError } = await supabase
          .from(table("invoices"))
          .select("id, status")
          .in("id", invoiceIds)
          .neq("status", "Paid");
        if (invoicesError) throw invoicesError;
        unpaidInvoiceIds = (invoices || []).map((row) => row.id);
      }

      if (unpaidInvoiceIds.length > 0 && !update_unpaid_invoices) {
        return Response.json(
          {
            warning: true,
            message: `${unpaidInvoiceIds.length} unpaid invoice${unpaidInvoiceIds.length > 1 ? "s" : ""} use${unpaidInvoiceIds.length === 1 ? "s" : ""} the old price of $${oldPrice.toFixed(2)}. Would you like to update them to the new price of $${newPrice.toFixed(2)}?`,
            unpaidCount: unpaidInvoiceIds.length,
            oldPrice,
            newPrice,
          },
          { status: 200 },
        );
      }

      if (update_unpaid_invoices && unpaidInvoiceIds.length > 0) {
        const { data: itemsToUpdate, error: itemsToUpdateError } = await supabase
          .from(table("invoice_items"))
          .select("id, quantity, invoice_id")
          .eq("product_id", id)
          .in("invoice_id", unpaidInvoiceIds);
        if (itemsToUpdateError) throw itemsToUpdateError;

        for (const item of itemsToUpdate || []) {
          const quantity = Number(item.quantity) || 1;
          const { error: itemUpdateError } = await supabase
            .from(table("invoice_items"))
            .update({
              unit_price: newPrice,
              amount: quantity * newPrice,
            })
            .eq("id", item.id);
          if (itemUpdateError) throw itemUpdateError;
        }
      }
    }

    const basePatch = {
      product_name,
      price: newPrice,
      updated_at: new Date().toISOString(),
    };
    const extendedPatch = {
      ...basePatch,
      placement: placement || "Standard",
    };

    let updateResult = await supabase
      .from(table("products"))
      .update(extendedPatch)
      .eq("id", id)
      .select("*")
      .single();

    if (updateResult.error) {
      const message = String(updateResult.error.message || "");
      const missingPlacement = message.includes("placement");
      if (!missingPlacement) throw updateResult.error;

      updateResult = await supabase
        .from(table("products"))
        .update(basePatch)
        .eq("id", id)
        .select("*")
        .single();
      if (updateResult.error) throw updateResult.error;
    }

    return Response.json(updateResult.data);
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
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    const { count: adsCountRaw, error: adsCountError } = await supabase
      .from(table("ads"))
      .select("*", { count: "exact", head: true })
      .eq("product_id", id)
      .neq("status", "Published");
    if (adsCountError) throw adsCountError;

    const { count: invoiceCountRaw, error: invoiceCountError } = await supabase
      .from(table("invoice_items"))
      .select("*", { count: "exact", head: true })
      .eq("product_id", id);
    if (invoiceCountError) throw invoiceCountError;

    const adsCount = adsCountRaw || 0;
    const invoiceCount = invoiceCountRaw || 0;

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

    const { data: removed, error: removeError } = await supabase
      .from(table("products"))
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (removeError) throw removeError;
    if (!removed) {
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
