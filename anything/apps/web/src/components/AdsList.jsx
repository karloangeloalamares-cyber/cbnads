"use client";

import { useState, useEffect, useRef } from "react";
import { useAdsData } from "@/hooks/useAdsData";
import { useAdvertisersAndProducts } from "@/hooks/useAdvertisersAndProducts";
import { useAdActions } from "@/hooks/useAdActions";
import { useAdSort } from "@/hooks/useAdSort";
import { useModal } from "@/hooks/useModal";
import { AlertModal, ConfirmModal } from "./Modal";
import { PageHeader } from "./AdsList/PageHeader";
import { FilterBar } from "./AdsList/FilterBar";
import { SearchAndActions } from "./AdsList/SearchAndActions";
import { AdsTable } from "./AdsList/AdsTable";
import { EmptyState } from "./AdsList/EmptyState";
import { LoadingState } from "./AdsList/LoadingState";
import { AdPreviewModal } from "./AdsList/AdPreviewModal";

export default function AdsList({ onCreateNew, onEditAd }) {
  const [filters, setFilters] = useState({
    status: "All Ads",
    placement: "All Placement",
    postType: "All post types",
    advertiser: "All Advertisers",
    payment: "All Payment Status",
    search: "",
    dateFrom: "",
    dateTo: "",
  });

  const [previewAd, setPreviewAd] = useState(null);
  const { modalState, showAlert, showConfirm } = useModal();

  const { ads, loading, error, refetch } = useAdsData(filters);
  const { advertisers, products } = useAdvertisersAndProducts();
  const { handleDeleteAd, handleMarkAsPublished, handleExport } = useAdActions(
    refetch,
    showAlert,
    showConfirm,
  );
  const { sortConfig, handleSort, sortedAds } = useAdSort(ads);

  const handlePreview = (ad) => {
    setPreviewAd(ad);
  };

  const handleEdit = (ad) => {
    if (onEditAd) {
      onEditAd(ad);
    }
  };

  // Get unique placements and post types from products
  const uniquePlacements = [
    ...new Set(products.map((p) => p.placement)),
  ].filter(Boolean);
  const uniquePostTypes = [...new Set(ads.map((a) => a.post_type))].filter(
    Boolean,
  );

  return (
    <>
      {/* Modals */}
      {modalState.type === "alert" && (
        <AlertModal {...modalState.props} isOpen={modalState.isOpen} />
      )}
      {modalState.type === "confirm" && (
        <ConfirmModal {...modalState.props} isOpen={modalState.isOpen} />
      )}

      <div className="max-w-[1600px] mx-auto p-8">
        <PageHeader />

        {/* Main Filters Bar */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            advertisers={advertisers}
            uniquePlacements={uniquePlacements}
            uniquePostTypes={uniquePostTypes}
          />

          <SearchAndActions
            filters={filters}
            setFilters={setFilters}
            onExport={() => handleExport(filters)}
            onCreateNew={onCreateNew}
          />
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600">
          Showing {sortedAds.length} of {ads.length} ads
        </div>

        {/* Table */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : sortedAds.length === 0 ? (
          <EmptyState onCreateNew={onCreateNew} />
        ) : (
          <AdsTable
            ads={sortedAds}
            sortConfig={sortConfig}
            onSort={handleSort}
            onPreview={handlePreview}
            onEdit={handleEdit}
            onMarkPublished={handleMarkAsPublished}
            onDelete={handleDeleteAd}
          />
        )}

        {/* Preview Modal */}
        <AdPreviewModal
          ad={previewAd}
          onClose={() => setPreviewAd(null)}
          onEdit={handleEdit}
        />
      </div>
    </>
  );
}
