"use client";

import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useInvoiceForm } from "@/hooks/useInvoiceForm";
import { useNewAdvertiser } from "@/hooks/useNewAdvertiser";
import { TopNavBar } from "./NewInvoiceForm/TopNavBar";
import { AdvertiserSelector } from "./NewInvoiceForm/AdvertiserSelector";
import { NewAdvertiserForm } from "./NewInvoiceForm/NewAdvertiserForm";
import { AdvertiserInfo } from "./NewInvoiceForm/AdvertiserInfo";
import { LineItems } from "./NewInvoiceForm/LineItems";
import { InvoicePreview } from "./NewInvoiceForm/InvoicePreview";
import { formatCurrency } from "@/utils/invoiceFormatters";
import { appToast } from "@/lib/toast";

export default function NewInvoiceForm({ onCancel, onSuccess }) {
  const showToastAlert = async ({ title, message, variant = "info" }) => {
    const payload = {
      title: title || "Notice",
      description: message || "",
    };

    if (variant === "danger") {
      appToast.error(payload);
      return true;
    }

    if (variant === "warning") {
      appToast.warning(payload);
      return true;
    }

    if (variant === "success") {
      appToast.success(payload);
      return true;
    }

    appToast.info(payload);
    return true;
  };

  const {
    advertisers,
    products,
    formData,
    setFormData,
    saving,
    error,
    handleAdvertiserChange,
    handleProductChangeForItem,
    handleItemChange,
    addLineItem,
    removeLineItem,
    calculateSubtotal,
    calculateTotal,
    handleSave,
    fetchAdvertisers,
  } = useInvoiceForm();

  const {
    showNewAdvertiserForm,
    setShowNewAdvertiserForm,
    newAdvertiser,
    setNewAdvertiser,
    creatingAdvertiser,
    handleCreateNewAdvertiser,
  } = useNewAdvertiser();

  const handleAdvertiserSelectChange = (advertiserId) => {
    if (advertiserId === "new") {
      setShowNewAdvertiserForm(true);
      return;
    }
    handleAdvertiserChange(advertiserId);
  };

  const handleCreateAdvertiser = async () => {
    await handleCreateNewAdvertiser(showToastAlert, async (created) => {
      await fetchAdvertisers();
      setFormData((prev) => ({
        ...prev,
        advertiser_id: created.id,
        advertiser_name: created.advertiser_name,
        contact_name: created.contact_name,
        contact_email: created.email,
        bill_to: created.advertiser_name,
      }));
    });
  };

  const subtotal = calculateSubtotal();
  const total = calculateTotal();

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to save invoice",
      description: error,
    });
  }, [error]);

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Top Navigation Bar */}
        <TopNavBar
          onCancel={onCancel}
          onSave={() => handleSave(onSuccess)}
          saving={saving}
        />

        {/* Main Content */}
        <div className="max-w-[1600px] mx-auto py-10 px-6">
          <div className="grid grid-cols-[1fr_520px] gap-8">
            {/* Left Column - Form */}
            <div>
              <button
                onClick={onCancel}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all mb-6"
              >
                <ChevronLeft size={16} />
                Back to Billing
              </button>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Create Invoice
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Select an advertiser and add line items
                </p>

                {/* Advertiser Selection */}
                <AdvertiserSelector
                  advertisers={advertisers}
                  value={formData.advertiser_id}
                  onChange={handleAdvertiserSelectChange}
                />

                {/* New Advertiser Inline Form */}
                {showNewAdvertiserForm && (
                  <NewAdvertiserForm
                    newAdvertiser={newAdvertiser}
                    setNewAdvertiser={setNewAdvertiser}
                    onClose={() => setShowNewAdvertiserForm(false)}
                    onCreate={handleCreateAdvertiser}
                    creating={creatingAdvertiser}
                  />
                )}

                {/* Advertiser Info */}
                <AdvertiserInfo
                  advertiserName={formData.advertiser_name}
                  contactName={formData.contact_name}
                  contactEmail={formData.contact_email}
                />

                {/* Bill To and Date */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Bill to
                    </label>
                    <input
                      type="text"
                      value={formData.bill_to}
                      onChange={(e) =>
                        setFormData({ ...formData, bill_to: e.target.value })
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
                      value={formData.issue_date}
                      onChange={(e) =>
                        setFormData({ ...formData, issue_date: e.target.value })
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
                <LineItems
                  items={formData.items}
                  products={products}
                  onProductChange={handleProductChangeForItem}
                  onItemChange={handleItemChange}
                  onAddItem={addLineItem}
                  onRemoveItem={removeLineItem}
                />

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
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right Column - Invoice Preview */}
            <div>
              <InvoicePreview
                formData={formData}
                subtotal={subtotal}
                total={total}
                formatCurrency={formatCurrency}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
