"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { useInvoiceSort } from "@/hooks/useInvoiceSort";
import { useModal } from "@/hooks/useModal";
import { ConfirmModal } from "./Modal";
import { calculateInvoiceSummary } from "@/utils/invoiceUtils";
import { appToast } from "@/lib/toast";
import { InvoiceHeader } from "./InvoicesList/InvoiceHeader";
import { InvoiceSummaryCards } from "./InvoicesList/InvoiceSummaryCards";
import { InvoiceFilters } from "./InvoicesList/InvoiceFilters";
import { InvoiceTable } from "./InvoicesList/InvoiceTable";
import { EmptyState } from "./InvoicesList/EmptyState";
import { LoadingState } from "./InvoicesList/LoadingState";
import { InvoicePreviewModal } from "./InvoicesList/InvoicePreviewModal";
import BatchInvoiceModal from "./BatchInvoiceModal";
import RecurringInvoiceModal from "./RecurringInvoiceModal";

export default function InvoicesList({ onCreateNew }) {
  const [filters, setFilters] = useState({
    status: "All",
    search: "",
  });
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const menuRef = useRef(null);
  const { modalState, showConfirm } = useModal();
  const showToastAlert = useCallback(async ({ title, message, variant = "info" }) => {
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
  }, []);

  const {
    invoices,
    loading,
    error,
    fetchInvoices,
    deleteInvoice,
    updateStatus,
  } = useInvoices(filters, showToastAlert, showConfirm);

  const { handleSort, sortedInvoices } = useInvoiceSort(invoices);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to load invoices",
      description: error,
    });
  }, [error]);

  const handlePreview = (invoice) => {
    setPreviewInvoice(invoice);
    setActiveMenu(null);
  };

  const handleUpdateStatus = async (invoiceId, newStatus) => {
    const success = await updateStatus(invoiceId, newStatus);
    if (success && previewInvoice && previewInvoice.id === invoiceId) {
      setPreviewInvoice((prev) => ({ ...prev, status: newStatus }));
    }
  };

  const handleBatchSuccess = () => {
    setShowBatchModal(false);
    fetchInvoices();
    showToastAlert({
      title: "Success",
      message: "Batch invoices created successfully!",
      variant: "success",
    });
  };

  const handleRecurringSuccess = () => {
    setShowRecurringModal(false);
    fetchInvoices();
    showToastAlert({
      title: "Success",
      message: "Recurring invoice generated successfully!",
      variant: "success",
    });
  };

  const { totalOutstanding, totalPaid, overdueCount } =
    calculateInvoiceSummary(invoices);

  return (
    <>
      {/* Modals */}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <div className="max-w-[1400px] mx-auto p-8">
        <InvoiceHeader
          onCreateNew={onCreateNew}
          onBatchInvoice={() => setShowBatchModal(true)}
          onRecurringInvoice={() => setShowRecurringModal(true)}
        />

        <InvoiceSummaryCards
          totalOutstanding={totalOutstanding}
          totalPaid={totalPaid}
          overdueCount={overdueCount}
        />

        <InvoiceFilters
          filters={filters}
          setFilters={setFilters}
          onSearch={fetchInvoices}
        />

        {loading ? (
          <LoadingState />
        ) : sortedInvoices.length === 0 ? (
          <EmptyState onCreateNew={onCreateNew} />
        ) : (
          <InvoiceTable
            invoices={sortedInvoices}
            onPreview={handlePreview}
            onDelete={deleteInvoice}
            onUpdateStatus={handleUpdateStatus}
            onSort={handleSort}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            menuPosition={menuPosition}
            setMenuPosition={setMenuPosition}
            menuRef={menuRef}
            showAlert={showToastAlert}
          />
        )}

        {previewInvoice && (
          <InvoicePreviewModal
            invoice={previewInvoice}
            onClose={() => setPreviewInvoice(null)}
            onUpdateStatus={handleUpdateStatus}
          />
        )}

        {showBatchModal && (
          <BatchInvoiceModal
            onClose={() => setShowBatchModal(false)}
            onSuccess={handleBatchSuccess}
          />
        )}

        {showRecurringModal && (
          <RecurringInvoiceModal
            onClose={() => setShowRecurringModal(false)}
            onSuccess={handleRecurringSuccess}
          />
        )}

        <style jsx global>{`
          @media print {
            body * { visibility: hidden; }
            .fixed.inset-0.z-50 *, .fixed.inset-0.z-50 { visibility: visible; }
            .fixed.inset-0.z-40 { display: none; }
            button { display: none !important; }
          }
        `}</style>
      </div>
    </>
  );
}
