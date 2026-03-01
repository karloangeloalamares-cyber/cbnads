"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  X,
} from "lucide-react";
import { appToast } from "@/lib/toast";
import { formatUSPhoneNumber, US_PHONE_INPUT_MAX_LENGTH } from "@/lib/phone";

export default function AdvertisersList({ onCreateNew }) {
  const [advertisers, setAdvertisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const menuRef = useRef(null);

  useEffect(() => {
    fetchAdvertisers();
  }, []);

  const fetchAdvertisers = async () => {
    try {
      const response = await fetch("/api/advertisers/list");
      if (!response.ok) {
        throw new Error(`Failed to fetch advertisers: ${response.status}`);
      }
      const data = await response.json();
      setAdvertisers(data.advertisers || []);
    } catch (error) {
      console.error("Error fetching advertisers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMenuClick = (advertiserId, event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const menuHeight = 350; // Increased threshold to open upward more aggressively
    const menuWidth = 200;

    setMenuPosition({
      vertical: spaceBelow < menuHeight ? "top" : "bottom",
      horizontal: spaceRight < menuWidth ? "left" : "right",
    });

    setOpenMenuId(openMenuId === advertiserId ? null : advertiserId);
  };

  const handleView = async (advertiserId) => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/advertisers/${advertiserId}`);
      const data = await response.json();
      setViewModal(data);
    } catch (error) {
      console.error("Error fetching advertiser details:", error);
    } finally {
      setActionLoading(false);
      setOpenMenuId(null);
    }
  };

  const handleEdit = (advertiser) => {
    setEditModal({ ...advertiser });
    setOpenMenuId(null);
  };

  const handleDelete = (advertiser) => {
    setDeleteModal(advertiser);
    setOpenMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/advertisers/${deleteModal.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("Delete failed:", error);
        appToast.error({
          title: "Failed to delete advertiser",
          description: error.error || "Unknown error",
        });
        return;
      }

      await fetchAdvertisers();
      setDeleteModal(null);
      appToast.success({
        title: "Advertiser deleted",
        description: `${deleteModal.advertiser_name} was removed successfully.`,
      });
    } catch (error) {
      console.error("Error deleting advertiser:", error);
      appToast.error({
        title: "Error deleting advertiser",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateAdvertiser = async (e) => {
    e.preventDefault();
    if (!editModal) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/advertisers/${editModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editModal),
      });
      if (response.ok) {
        await fetchAdvertisers();
        setEditModal(null);
        appToast.success({
          title: "Advertiser updated",
          description: "Changes saved successfully.",
        });
      }
    } catch (error) {
      console.error("Error updating advertiser:", error);
      appToast.error({
        title: "Failed to update advertiser",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredAdvertisers = advertisers.filter((advertiser) => {
    const query = searchQuery.toLowerCase();
    return (
      advertiser.advertiser_name.toLowerCase().includes(query) ||
      advertiser.contact_name.toLowerCase().includes(query) ||
      advertiser.email.toLowerCase().includes(query)
    );
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    // Extract just the date part (YYYY-MM-DD)
    const datePart = dateString.split("T")[0].split(" ")[0];
    const d = new Date(datePart + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Advertisers
          </h1>
          <p className="text-sm text-gray-500">
            Manage all your advertiser accounts
          </p>
        </div>
        <button
          onClick={onCreateNew}
          className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          Add new Advertiser
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search advertisers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Advertiser Name
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Contact Name
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Email
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Phone Number
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Total Spend
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Next Ad Date
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Status
              </th>
              <th className="text-left px-6 py-3 text-[11px] font-semibold text-gray-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan="8"
                  className="px-6 py-12 text-center text-xs text-gray-500"
                >
                  Loading advertisers...
                </td>
              </tr>
            ) : filteredAdvertisers.length === 0 ? (
              <tr>
                <td
                  colSpan="8"
                  className="px-6 py-12 text-center text-xs text-gray-500"
                >
                  {searchQuery
                    ? "No advertisers found matching your search"
                    : "No advertisers yet. Click 'Add new Advertiser' to get started."}
                </td>
              </tr>
            ) : (
              filteredAdvertisers.map((advertiser) => (
                <tr
                  key={advertiser.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-3.5">
                    <div className="text-xs font-medium text-gray-900">
                      {advertiser.advertiser_name}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="text-xs text-gray-900">
                      {advertiser.contact_name}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="text-xs text-gray-600">
                      {advertiser.email}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="text-xs text-gray-600">
                      {advertiser.phone_number || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="text-xs font-medium text-gray-900">
                      {formatCurrency(advertiser.total_spend)}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="text-xs text-gray-600">
                      {formatDate(advertiser.next_ad_date)}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-medium ${
                        advertiser.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {advertiser.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 relative">
                    <button
                      onClick={(e) => handleMenuClick(advertiser.id, e)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <MoreVertical size={18} className="text-gray-600" />
                    </button>

                    {/* Dropdown Menu */}
                    {openMenuId === advertiser.id && (
                      <div
                        ref={menuRef}
                        className={`absolute ${menuPosition.vertical === "top" ? "bottom-full mb-1" : "top-full mt-1"} ${menuPosition.horizontal === "left" ? "right-0" : "left-auto"} w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[100]`}
                      >
                        <button
                          onClick={() => handleView(advertiser.id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Eye size={16} />
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(advertiser)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Edit2 size={16} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(advertiser)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* View Modal */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Advertiser Details
              </h2>
              <button
                onClick={() => setViewModal(null)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Advertiser Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Advertiser Name</p>
                    <p className="text-sm font-medium text-gray-900">
                      {viewModal.advertiser.advertiser_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Contact Name</p>
                    <p className="text-sm font-medium text-gray-900">
                      {viewModal.advertiser.contact_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900">
                      {viewModal.advertiser.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Phone Number</p>
                    <p className="text-sm font-medium text-gray-900">
                      {viewModal.advertiser.phone_number || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Spend</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(viewModal.advertiser.total_spend)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Date Added</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatDate(viewModal.advertiser.created_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        viewModal.advertiser.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {viewModal.advertiser.status === "active"
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ads List */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Ads ({viewModal.ads.length})
                </h3>
                {viewModal.ads.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No ads for this advertiser yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {viewModal.ads.map((ad) => (
                      <div
                        key={ad.id}
                        className="p-3 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {ad.ad_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {ad.post_type} • {ad.placement} •{" "}
                              {formatDate(ad.post_date_from)}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              ad.status === "scheduled"
                                ? "bg-blue-100 text-blue-800"
                                : ad.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {ad.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Edit Advertiser
              </h2>
              <button
                onClick={() => setEditModal(null)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateAdvertiser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Advertiser Name
                </label>
                <input
                  type="text"
                  required
                  value={editModal.advertiser_name}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      advertiser_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  required
                  value={editModal.contact_name}
                  onChange={(e) =>
                    setEditModal({ ...editModal, contact_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editModal.email || ""}
                  onChange={(e) =>
                    setEditModal({ ...editModal, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={editModal.phone_number || ""}
                  onChange={(e) =>
                    setEditModal({
                      ...editModal,
                      phone_number: formatUSPhoneNumber(e.target.value),
                    })
                  }
                  inputMode="tel"
                  autoComplete="tel-national"
                  maxLength={US_PHONE_INPUT_MAX_LENGTH}
                  placeholder="(123) 456-7890"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={editModal.status}
                  onChange={(e) =>
                    setEditModal({ ...editModal, status: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                >
                  {actionLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Delete Advertiser
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete{" "}
              <strong>{deleteModal.advertiser_name}</strong>? This will
              permanently delete the advertiser and all associated ads and
              reminders. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-400"
              >
                {actionLoading ? "Deleting..." : "Yes, I'm Sure"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </div>
  );
}
