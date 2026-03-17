import { db, table, toNumber } from "../utils/supabase-db.js";
import {
  getRequestStatusForError,
  isAdvertiserUser,
  matchesAdvertiserScope,
  requireAdmin,
  requireAuth,
  requirePermission,
  resolveAdvertiserScope,
} from "../utils/auth-check.js";
import { recalculateAdvertiserSpend } from "../utils/recalculate-advertiser-spend.js";
import {
  rebalanceInvoiceLineItemsToSubtotal,
  sumInvoiceItemAmounts,
} from "../utils/invoice-helpers.js";
import { can } from "../../../lib/permissions.js";
import { getTodayInAppTimeZone } from "../../../lib/timezone.js";

const computeInvoiceStatus = (invoiceTotal, amountPaid, currentStatus) => {
  if (String(currentStatus || "").toLowerCase() === "paid") return "Paid";
  if (amountPaid >= invoiceTotal && invoiceTotal > 0) return "Paid";
  if (amountPaid > 0) return "Partial";
  return "Pending";
};

const isInvoiceNotFoundError = (error) =>
  /invoice_not_found|invoice not found/i.test(String(error?.message || ""));

const isInvoiceAlreadyDeletedError = (error) =>
  /invoice_already_deleted|invoice already deleted/i.test(String(error?.message || ""));

export async function GET(request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return Response.json(
        { error: auth.error },
        { status: auth.status || getRequestStatusForError(auth.error) },
      );
    }

    if (!isAdvertiserUser(auth.user) && !can(auth.user.role, "billing:view")) {
      return Response.json({ error: "Unauthorized - Billing access required" }, { status: 403 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const advertiser_id = searchParams.get("advertiser_id");
    const invoiceId = searchParams.get("id");
    const advertiserScope = isAdvertiserUser(auth.user)
      ? await resolveAdvertiserScope(auth.user)
      : null;

    if (invoiceId) {
      const { data: invoice, error: invoiceError } = await supabase
        .from(table("invoices"))
        .select("*")
        .eq("id", invoiceId)
        .is("deleted_at", null)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      if (advertiserScope && !matchesAdvertiserScope(invoice, advertiserScope)) {
        return Response.json({ error: "Invoice not found" }, { status: 404 });
      }

      const { data: items, error: itemsError } = await supabase
        .from(table("invoice_items"))
        .select("id, invoice_id, ad_id, product_id, description, quantity, unit_price, amount")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: true });
      if (itemsError) throw itemsError;

      return Response.json({ invoice: { ...invoice, items: items || [] } });
    }

    let query = supabase
      .from(table("invoices"))
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status && status !== "All") {
      query = query.eq("status", status);
    }
    if (!advertiserScope && advertiser_id) {
      query = query.eq("advertiser_id", advertiser_id);
    }

    const { data: invoices, error: invoicesError } = await query;
    if (invoicesError) throw invoicesError;

    const authorizedInvoices = advertiserScope
      ? (invoices || []).filter((invoice) => matchesAdvertiserScope(invoice, advertiserScope))
      : invoices || [];
    let filtered = [...authorizedInvoices];
    if (search) {
      const needle = String(search).toLowerCase();
      filtered = filtered.filter((invoice) => {
        const invoiceNumber = String(invoice.invoice_number || "").toLowerCase();
        const advertiserName = String(invoice.advertiser_name || "").toLowerCase();
        return invoiceNumber.includes(needle) || advertiserName.includes(needle);
      });
    }

    const ids = filtered.map((invoice) => invoice.id);
    let itemRows = [];
    if (ids.length > 0) {
      const { data, error } = await supabase
        .from(table("invoice_items"))
        .select("id, invoice_id, ad_id, product_id, description, quantity, unit_price, amount")
        .in("invoice_id", ids)
        .order("created_at", { ascending: true });
      if (error) throw error;
      itemRows = data || [];
    }

    const itemsByInvoice = new Map();
    for (const row of itemRows) {
      const list = itemsByInvoice.get(row.invoice_id) || [];
      list.push(row);
      itemsByInvoice.set(row.invoice_id, list);
    }

    const result = filtered.map((invoice) => ({
      ...invoice,
      items: itemsByInvoice.get(invoice.id) || [],
    }));

    const summary = authorizedInvoices.reduce(
      (accumulator, invoice) => {
        const statusValue = String(invoice.status || "").trim().toLowerCase();
        const total = toNumber(invoice.total ?? invoice.amount, 0);
        const amountPaid = toNumber(invoice.amount_paid, statusValue === "paid" ? total : 0);
        const outstanding = Math.max(total - amountPaid, 0);

        if (statusValue === "paid") {
          accumulator.collected += amountPaid || total;
        } else if (statusValue === "partial") {
          accumulator.collected += amountPaid;
          accumulator.outstanding += outstanding;
        } else if (statusValue === "overdue") {
          accumulator.outstanding += outstanding || total;
          accumulator.overdueCount += 1;
        } else {
          accumulator.outstanding += outstanding || total;
        }

        return accumulator;
      },
      { outstanding: 0, collected: 0, overdueCount: 0 },
    );

    return Response.json({ invoices: result, summary });
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
    const auth = await requirePermission("billing:edit", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const supabase = db();
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
      amount,
      total,
    } = body;

    const { data: currentInvoice, error: currentInvoiceError } = await supabase
      .from(table("invoices"))
      .select("id, advertiser_id, status, total, amount_paid, discount, tax")
      .eq("id", id)
      .maybeSingle();
    if (currentInvoiceError) throw currentInvoiceError;
    if (!currentInvoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    const normalizedDiscount =
      discount !== undefined ? toNumber(discount, 0) : toNumber(currentInvoice.discount, 0);
    const normalizedTax =
      tax !== undefined ? toNumber(tax, 0) : toNumber(currentInvoice.tax, 0);

    const nextAmountPaid =
      amount_paid !== undefined ? toNumber(amount_paid, 0) : toNumber(currentInvoice.amount_paid, 0);

    let normalizedItems = Array.isArray(items)
      ? items.map((item) => {
          const quantity = toNumber(item?.quantity, 1) || 1;
          const unitPrice = toNumber(item?.unit_price, 0);
          const amount = toNumber(item?.amount, quantity * unitPrice);
          return {
            ad_id: item?.ad_id || null,
            product_id: item?.product_id || null,
            description: item?.description || "",
            quantity,
            unit_price: unitPrice,
            amount,
          };
        })
      : [];

    let computedTotal = toNumber(currentInvoice.total, 0);
    const explicitTotal = Number(total ?? amount);
    if (normalizedItems.length > 0) {
      const currentSubtotal = sumInvoiceItemAmounts(normalizedItems);
      const currentTotal = currentSubtotal - normalizedDiscount + normalizedTax;
      const targetSubtotal =
        Number.isFinite(explicitTotal) && explicitTotal > 0
          ? Math.max(0, explicitTotal + normalizedDiscount - normalizedTax)
          : currentSubtotal;

      if (
        Number.isFinite(explicitTotal) &&
        explicitTotal > 0 &&
        (currentSubtotal <= 0 || Math.abs(currentTotal - explicitTotal) > 0.009)
      ) {
        normalizedItems = rebalanceInvoiceLineItemsToSubtotal(normalizedItems, targetSubtotal);
      }

      computedTotal =
        sumInvoiceItemAmounts(normalizedItems) - normalizedDiscount + normalizedTax;
    }

    const nextStatus =
      status !== undefined
        ? status
        : computeInvoiceStatus(computedTotal, nextAmountPaid, currentInvoice.status);

    const patch = {
      updated_at: new Date().toISOString(),
      total: computedTotal,
      amount: computedTotal,
      amount_paid: nextAmountPaid,
      status: nextStatus,
    };
    if (issue_date !== undefined) {
      patch.issue_date = issue_date || getTodayInAppTimeZone();
    }
    if (advertiser_id !== undefined) patch.advertiser_id = advertiser_id || null;
    if (advertiser_name !== undefined) patch.advertiser_name = advertiser_name;
    if (contact_name !== undefined) patch.contact_name = contact_name;
    if (contact_email !== undefined) patch.contact_email = contact_email;
    if (bill_to !== undefined) patch.bill_to = bill_to;
    if (discount !== undefined) patch.discount = normalizedDiscount;
    if (tax !== undefined) patch.tax = normalizedTax;
    if (notes !== undefined) patch.notes = notes;

    const { data: updateResultRows, error: updateResultError } = await supabase.rpc(
      "cbnads_web_update_invoice_atomic",
      {
        p_invoice_id: id,
        p_patch: patch,
        p_items: normalizedItems,
        p_replace_items: Array.isArray(items),
      },
    );
    if (updateResultError) throw updateResultError;

    const updateResult = Array.isArray(updateResultRows)
      ? updateResultRows[0] || null
      : updateResultRows;

    const oldAdvertiserId = updateResult?.old_advertiser_id || currentInvoice.advertiser_id;
    const newAdvertiserId =
      updateResult?.new_advertiser_id ||
      (advertiser_id !== undefined ? advertiser_id : oldAdvertiserId);
    if (newAdvertiserId) {
      await recalculateAdvertiserSpend(newAdvertiserId);
    }
    if (oldAdvertiserId && oldAdvertiserId !== newAdvertiserId) {
      await recalculateAdvertiserSpend(oldAdvertiserId);
    }

    const { data: updatedInvoice, error: updatedInvoiceError } = await supabase
      .from(table("invoices"))
      .select("*")
      .eq("id", id)
      .single();
    if (updatedInvoiceError) throw updatedInvoiceError;

    const { data: updatedItems, error: updatedItemsError } = await supabase
      .from(table("invoice_items"))
      .select("*")
      .eq("invoice_id", id)
      .order("created_at", { ascending: true });
    if (updatedItemsError) throw updatedItemsError;

    return Response.json({
      invoice: { ...updatedInvoice, items: updatedItems || [] },
    });
  } catch (error) {
    if (isInvoiceNotFoundError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }

    console.error("Error updating invoice:", error);
    return Response.json(
      { error: "Failed to update invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: admin.status || 401 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json(
        { error: "Invoice ID is required" },
        { status: 400 },
      );
    }

    const { data: deleteResultRows, error: deleteError } = await supabase.rpc(
      "cbnads_web_soft_delete_invoice_atomic",
      {
        p_invoice_id: id,
        p_created_by: admin.user?.id || null,
      },
    );
    if (deleteError) throw deleteError;

    const deleteResult = Array.isArray(deleteResultRows)
      ? deleteResultRows[0] || null
      : deleteResultRows;

    if (deleteResult?.advertiser_id) {
      await recalculateAdvertiserSpend(deleteResult.advertiser_id);
    }

    return Response.json({ success: true });
  } catch (error) {
    if (isInvoiceNotFoundError(error)) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (isInvoiceAlreadyDeletedError(error)) {
      return Response.json({ error: "Invoice already deleted" }, { status: 409 });
    }

    console.error("Error deleting invoice:", error);
    return Response.json(
      { error: "Failed to delete invoice" },
      { status: 500 },
    );
  }
}
