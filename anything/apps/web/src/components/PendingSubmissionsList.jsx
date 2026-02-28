"use client";

import { useEffect, useState } from "react";
import { usePendingAds } from "@/hooks/usePendingAds";
import { appToast } from "@/lib/toast";
import { PageHeader } from "./PendingSubmissionsList/PageHeader";
import { LoadingState } from "./PendingSubmissionsList/LoadingState";
import { SubmissionsTable } from "./PendingSubmissionsList/SubmissionsTable";
import { ViewModal } from "./PendingSubmissionsList/ViewModal";
import { EditModal } from "./PendingSubmissionsList/EditModal";
import { ApproveModal } from "./PendingSubmissionsList/ApproveModal";
import { DeleteModal } from "./PendingSubmissionsList/DeleteModal";

export default function PendingSubmissionsList() {
  const {
    pendingAds,
    loading,
    error,
    processingId,
    checkForDuplicateAdvertiser,
    handleApprove,
    handleReject,
    handleDelete,
    handleUpdate,
  } = usePendingAds();

  const [selectedAd, setSelectedAd] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState(null);
  const [duplicateAdvertiser, setDuplicateAdvertiser] = useState(null);

  useEffect(() => {
    if (!error) {
      return;
    }

    appToast.error({
      title: "Unable to load submissions",
      description: error,
    });
  }, [error]);

  const handleViewClick = (ad) => {
    setSelectedAd(ad);
    setShowViewModal(true);
  };

  const handleApproveClick = async (ad) => {
    setSelectedAd(ad);
    const duplicate = await checkForDuplicateAdvertiser(ad.email);
    setDuplicateAdvertiser(duplicate);
    setShowApproveModal(true);
  };

  const handleEditClick = (ad) => {
    setSelectedAd(ad);
    setEditFormData({
      advertiser_name: ad.advertiser_name || "",
      contact_name: ad.contact_name || "",
      email: ad.email || "",
      phone_number: ad.phone_number || "",
      ad_name: ad.ad_name || "",
      post_type: ad.post_type || "One-Time Post",
      post_date_from: ad.post_date_from || "",
      post_date_to: ad.post_date_to || "",
      custom_dates: ad.custom_dates || [],
      post_time: ad.post_time || "",
      reminder_minutes: ad.reminder_minutes || 15,
      ad_text: ad.ad_text || "",
      placement: ad.placement || "",
      notes: ad.notes || "",
    });
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedAd || !editFormData) return;

    const result = await handleUpdate(selectedAd.id, editFormData);
    if (result.success) {
      setShowEditModal(false);
      setSelectedAd(null);
      setEditFormData(null);
    }
  };

  const handleApproveConfirm = async (useExisting = false) => {
    if (!selectedAd) return;

    const result = await handleApprove(
      selectedAd.id,
      useExisting,
      duplicateAdvertiser?.id,
    );

    if (result.success) {
      setShowApproveModal(false);
      setSelectedAd(null);
      setDuplicateAdvertiser(null);
    }
  };

  const handleDeleteClick = (ad) => {
    setSelectedAd(ad);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedAd) return;

    const result = await handleDelete(selectedAd.id);
    if (result.success) {
      setShowDeleteModal(false);
      setSelectedAd(null);
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="p-8">
      <PageHeader />

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <SubmissionsTable
          pendingAds={pendingAds}
          processingId={processingId}
          onView={handleViewClick}
          onEdit={handleEditClick}
          onApprove={handleApproveClick}
          onReject={handleReject}
          onDelete={handleDeleteClick}
        />
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditModal
          ad={selectedAd}
          formData={editFormData}
          onFormChange={setEditFormData}
          onSave={handleEditSave}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAd(null);
            setEditFormData(null);
          }}
          processing={processingId === selectedAd?.id}
        />
      )}

      {/* View Details Modal */}
      {showViewModal && (
        <ViewModal
          ad={selectedAd}
          onClose={() => {
            setShowViewModal(false);
            setSelectedAd(null);
          }}
        />
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <ApproveModal
          ad={selectedAd}
          duplicateAdvertiser={duplicateAdvertiser}
          processing={processingId === selectedAd?.id}
          onApprove={handleApproveConfirm}
          onClose={() => {
            setShowApproveModal(false);
            setSelectedAd(null);
            setDuplicateAdvertiser(null);
          }}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <DeleteModal
          ad={selectedAd}
          processing={processingId === selectedAd?.id}
          onDelete={handleDeleteConfirm}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedAd(null);
          }}
        />
      )}
    </div>
  );
}
