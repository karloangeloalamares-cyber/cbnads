"use client";

import { useState, useEffect } from "react";
import { Globe, Calendar, ChevronLeft, Plus, Trash2 } from "lucide-react";
import { appToast } from "@/lib/toast";
import { getTodayInAppTimeZone } from "@/lib/timezone";

export default function BillingForm({
  adData,
  onBack,
  onCancel,
  onSaveDraft,
  onPublish,
}) {
  const [advertiserData, setAdvertiserData] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    billTo: "",
    issueDate: getTodayInAppTimeZone(),
    status: "Paid",
    notes: "",
    discount: "0",
  });

  // Line items - will be built from ad data
  const [lineItems, setLineItems] = useState([]);

  useEffect(() => {
    fetchAllProducts();
    fetchAdvertiserData();
    buildLineItems();
  }, []);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to save billing details",
      description: error,
    });
  }, [error]);

  const fetchAllProducts = async () => {
    try {
      const response = await fetch("/api/products/list");
      if (!response.ok)
        throw new Error(`Failed to fetch products: ${response.status}`);
      const products = await response.json();
      setAllProducts(products);
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const fetchAdvertiserData = async () => {
    if (!adData?.advertiser) return;

    try {
      const response = await fetch("/api/advertisers/list");
      if (!response.ok)
        throw new Error(`Failed to fetch advertisers: ${response.status}`);
      const data = await response.json();
      const advertiser = data.advertisers?.find(
        (a) => a.advertiser_name === adData.advertiser,
      );

      if (advertiser) {
        setAdvertiserData(advertiser);
        setFormData((prev) => ({
          ...prev,
          companyName: advertiser.advertiser_name,
          contactName: advertiser.contact_name,
          contactEmail: advertiser.email,
          billTo: advertiser.advertiser_name,
        }));
      }
    } catch (err) {
      console.error("Error fetching advertiser data:", err);
    }
  };

  const buildLineItems = async () => {
    // Determine line items based on post type and schedule
    const items = [];

    // Fetch product info for pricing
    let productPrice = 0;
    let productName = "Ad Placement";
    let productId = null;

    if (adData?.product_id) {
      try {
        const response = await fetch("/api/products/list");
        if (response.ok) {
          const products = await response.json();
          const product = products.find(
            (p) => p.id === parseInt(adData.product_id),
          );
          if (product) {
            productPrice = parseFloat(product.price) || 0;
            productName = `${product.product_name} - ${product.placement}`;
            productId = product.id;
          }
        }
      } catch (err) {
        console.error("Error fetching product:", err);
      }
    }

    // Use override amount if set
    const overrideAmount = adData?.overrideAmount
      ? parseFloat(adData.overrideAmount.replace(/[$,]/g, "")) || 0
      : 0;
    const unitPrice = overrideAmount > 0 ? overrideAmount : productPrice;

    if (
      adData?.postType === "Daily Run" &&
      adData?.postDateFrom &&
      adData?.postDateTo
    ) {
      // For daily runs, create an item per day
      const startDate = new Date(adData.postDateFrom);
      const endDate = new Date(adData.postDateTo);
      const dayDiff =
        Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

      for (let i = 0; i < dayDiff; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        items.push({
          product_id: productId,
          description: `${adData.adName || productName} — ${dateStr}`,
          quantity: 1,
          unit_price: unitPrice,
          amount: unitPrice,
        });
      }
    } else if (
      adData?.postType === "Custom Schedule" &&
      adData?.customDates?.length > 0
    ) {
      // For custom schedules, create an item per date
      for (const dateVal of adData.customDates) {
        if (!dateVal) continue;
        const date = new Date(dateVal);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
        items.push({
          product_id: productId,
          description: `${adData.adName || productName} — ${dateStr}`,
          quantity: 1,
          unit_price: unitPrice,
          amount: unitPrice,
        });
      }
    } else {
      // One-Time Post - single item
      items.push({
        product_id: productId,
        description: adData.adName || productName,
        quantity: 1,
        unit_price: unitPrice,
        amount: unitPrice,
      });
    }

    setLineItems(items);
  };

  const handleProductChangeForItem = (index, prodId) => {
    const selectedProduct = allProducts.find((p) => p.id === parseInt(prodId));
    if (selectedProduct) {
      const price = parseFloat(selectedProduct.price) || 0;
      const newItems = [...lineItems];
      newItems[index] = {
        ...newItems[index],
        product_id: selectedProduct.id,
        description: `${selectedProduct.product_name} - ${selectedProduct.placement}`,
        unit_price: price,
        amount: price * (newItems[index].quantity || 1),
      };
      setLineItems(newItems);
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === "unit_price" || field === "quantity") {
      const up =
        field === "unit_price"
          ? parseFloat(value) || 0
          : parseFloat(newItems[index].unit_price) || 0;
      const qty =
        field === "quantity"
          ? parseInt(value) || 1
          : parseInt(newItems[index].quantity) || 1;
      newItems[index].amount = up * qty;
    }

    setLineItems(newItems);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        product_id: null,
        description: "",
        quantity: 1,
        unit_price: 0,
        amount: 0,
      },
    ]);
  };

  const removeLineItem = (index) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateSubtotal = () => {
    return lineItems.reduce(
      (sum, item) => sum + (parseFloat(item.amount) || 0),
      0,
    );
  };

  const subtotal = calculateSubtotal();
  const discountNum = parseFloat(formData.discount) || 0;
  const tax = 0;
  const total = subtotal - discountNum + tax;

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return `$${num.toFixed(2)}`;
  };

  const handleSave = async (status) => {
    setError(null);
    setSaving(true);

    try {
      // Convert time to 24-hour format for database
      let postTime = null;
      if (adData.postHour && adData.postMinute && adData.postPeriod) {
        let hour = parseInt(adData.postHour);
        if (adData.postPeriod === "PM" && hour !== 12) hour += 12;
        else if (adData.postPeriod === "AM" && hour === 12) hour = 0;
        postTime = `${String(hour).padStart(2, "0")}:${adData.postMinute}:00`;
      }

      // Convert reminder to minutes
      let reminderMinutes = 15;
      if (adData.reminder === "15-min") reminderMinutes = 15;
      else if (adData.reminder === "30-min") reminderMinutes = 30;
      else if (adData.reminder === "1-hour") reminderMinutes = 60;
      else if (adData.reminder === "1-day") reminderMinutes = 1440;
      else if (adData.reminder === "custom" && adData.customReminderMinutes) {
        reminderMinutes = parseInt(adData.customReminderMinutes);
      }

      const adPayload = {
        ad_name: adData.adName,
        advertiser: adData.advertiser,
        status: status,
        post_type: adData.postType,
        placement: adData.placement,
        schedule: adData.postDate || null,
        post_date_from: adData.postDateFrom || null,
        post_date_to: adData.postDateTo || null,
        custom_dates: adData.customDates || [],
        payment: formData.status === "Paid" ? "Paid" : `$${total.toFixed(2)}`,
        product_id: adData.product_id || null,
        media: adData.media || [],
        ad_text: adData.adText || "",
        post_time: postTime,
        reminder_minutes: reminderMinutes,
      };

      let adResponse;
      const isEditing = adData.id;

      if (isEditing) {
        adResponse = await fetch("/api/ads/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...adPayload, id: adData.id }),
        });
      } else {
        adResponse = await fetch("/api/ads/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adPayload),
        });
      }

      if (!adResponse.ok) {
        throw new Error(
          `Failed to ${isEditing ? "update" : "create"} ad: ${adResponse.status}`,
        );
      }

      const adResult = await adResponse.json();
      const adId = adResult.ad?.id || adResult.id || adData.id;

      // Create invoice
      const validItems = lineItems
        .filter(
          (item) => item.description && (parseFloat(item.amount) || 0) > 0,
        )
        .map((item) => ({
          ad_id: adId || null,
          product_id: item.product_id || null,
          description: item.description,
          quantity: item.quantity || 1,
          unit_price: parseFloat(item.unit_price) || 0,
          amount: parseFloat(item.amount) || 0,
        }));

      if (validItems.length > 0) {
        const invoiceResponse = await fetch("/api/invoices/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            advertiser_id: advertiserData?.id || null,
            advertiser_name: formData.companyName || adData.advertiser,
            contact_name: formData.contactName,
            contact_email: formData.contactEmail,
            bill_to: formData.billTo,
            issue_date: formData.issueDate,
            status: formData.status,
            discount: discountNum,
            tax: tax,
            notes: formData.notes,
            items: validItems,
          }),
        });

        if (!invoiceResponse.ok) {
          console.error("Failed to create invoice, but ad was saved");
        }
      }

      if (status === "Draft") {
        onSaveDraft();
      } else {
        onPublish();
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between relative">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
              <Globe size={22} className="text-white" />
            </div>
          </div>
          <h1 className="text-base font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2">
            New Advertisement / Billing
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave("Draft")}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save as draft"}
            </button>
            <button
              onClick={() => handleSave("Scheduled")}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-all shadow-sm hover:shadow disabled:opacity-50"
            >
              {saving ? "Scheduling..." : "Schedule Ad"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto py-10 px-6">
        <div className="grid grid-cols-[1fr_520px] gap-8">
          {/* Left Column - Edit Invoice Form */}
          <div>
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all mb-6"
            >
              <ChevronLeft size={16} />
              Back to ad details
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Edit Invoice
              </h2>
              <p className="text-sm text-gray-500 mb-8">
                Customize invoice details and line items
              </p>

              {/* Company Info */}
              <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-gray-900 mb-1">
                  {formData.companyName || adData?.advertiser || "—"}
                </div>
                <div className="text-sm text-gray-600">
                  {formData.contactName}
                </div>
                <div className="text-sm text-gray-600">
                  {formData.contactEmail}
                </div>
              </div>

              {/* Bill To, Issue Date */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Bill to
                  </label>
                  <input
                    type="text"
                    value={formData.billTo}
                    onChange={(e) =>
                      setFormData({ ...formData, billTo: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, issueDate: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="mb-8">
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                >
                  <option>Paid</option>
                  <option>Pending</option>
                  <option>Overdue</option>
                </select>
              </div>

              {/* Line Items */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Line Items
                  </h3>
                  <button
                    onClick={addLineItem}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-black transition-colors"
                  >
                    <Plus size={16} />
                    Add Item
                  </button>
                </div>
                <div className="grid grid-cols-[180px_1fr_80px_100px_32px] gap-3 mb-3">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Product
                  </div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Description
                  </div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Qty
                  </div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Amount
                  </div>
                  <div></div>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[180px_1fr_80px_100px_32px] gap-3"
                    >
                      <select
                        value={item.product_id || ""}
                        onChange={(e) =>
                          handleProductChangeForItem(index, e.target.value)
                        }
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      >
                        <option value="">Select</option>
                        {allProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.product_name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleItemChange(index, "description", e.target.value)
                        }
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      />
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(index, "quantity", e.target.value)
                        }
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={item.amount}
                        onChange={(e) => {
                          handleItemChange(index, "amount", e.target.value);
                          handleItemChange(index, "unit_price", e.target.value);
                        }}
                        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                      />
                      <button
                        onClick={() => removeLineItem(index)}
                        disabled={lineItems.length <= 1}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={16} className="text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Discount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.discount}
                  onChange={(e) =>
                    setFormData({ ...formData, discount: e.target.value })
                  }
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                  placeholder="0.00"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Add any additional notes or payment instructions..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all resize-none"
                />
              </div>
            </div>
          </div>

          {/* Right Column - Invoice Preview */}
          <div>
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-10 sticky top-8">
              <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Invoice Preview
              </div>

              {/* Company Logo and Info */}
              <div className="flex items-start justify-between mb-10 pb-8 border-b border-gray-200">
                <div>
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center mb-4 shadow-sm">
                    <Globe size={26} className="text-white" />
                  </div>
                  <div className="text-base font-bold text-gray-900 mb-2">
                    CBN Media LLC
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>2345 Manhattan Ave</div>
                    <div>advertise@cbnads.com</div>
                    <div>800.938.0499</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-2">New Invoice</div>
                  <div
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      formData.status === "Paid"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                        : formData.status === "Pending"
                          ? "text-amber-700 bg-amber-50 border-amber-100"
                          : "text-rose-700 bg-rose-50 border-rose-100"
                    }`}
                  >
                    {formData.status.toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Bill To and Dates */}
              <div className="grid grid-cols-2 gap-8 mb-10 pb-8 border-b border-gray-200">
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Bill to
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    {formData.billTo || "—"}
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <div>Attn: {formData.contactName}</div>
                    <div>{formData.contactEmail}</div>
                  </div>
                </div>
                <div className="text-right space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Issue Date
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formData.issueDate
                        ? new Date(
                            formData.issueDate + "T00:00:00",
                          ).toLocaleDateString("en-US")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Amount Due
                    </div>
                    <div className="text-lg font-bold text-gray-900">
                      {formatCurrency(total)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items */}
              <div className="mb-8">
                <div className="flex justify-between mb-3">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Description
                  </div>
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Amount
                  </div>
                </div>
                {lineItems.map((item, index) => {
                  const hasContent =
                    item.description || (parseFloat(item.amount) || 0) > 0;
                  if (!hasContent) return null;
                  return (
                    <div
                      key={index}
                      className="flex justify-between py-3 border-b border-gray-100"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.description || "No description"}
                        </div>
                        {item.quantity > 1 && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {item.quantity} × {formatCurrency(item.unit_price)}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(item.amount)}
                      </div>
                    </div>
                  );
                })}
                {lineItems.length === 0 && (
                  <div className="py-3 text-sm text-gray-400 italic">
                    No items added yet
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="space-y-3 mb-10 pb-8 border-b border-gray-200">
                <div className="flex justify-between text-sm">
                  <div className="text-gray-600">Subtotal</div>
                  <div className="font-medium text-gray-900">
                    {formatCurrency(subtotal)}
                  </div>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-sm">
                    <div className="text-gray-600">Discount</div>
                    <div className="font-medium text-gray-900">
                      -{formatCurrency(discountNum)}
                    </div>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <div className="text-gray-600">Tax</div>
                  <div className="font-medium text-gray-900">
                    {formatCurrency(tax)}
                  </div>
                </div>
                <div className="flex justify-between text-base font-bold pt-3 border-t border-gray-200">
                  <div className="text-gray-900">Total</div>
                  <div className="text-gray-900">{formatCurrency(total)}</div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center space-y-2">
                <div className="text-sm font-medium text-gray-900">
                  Thank you for your business
                </div>
                <div className="text-xs text-gray-500 leading-relaxed">
                  Payment is due upon receipt. Please include invoice number in
                  transfer description.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
