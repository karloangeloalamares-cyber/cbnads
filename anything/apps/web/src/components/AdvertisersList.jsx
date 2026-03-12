"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  X,
  LayoutGrid,
  List,
} from "lucide-react";
import { appToast } from "@/lib/toast";
import { formatUSPhoneNumber, US_PHONE_INPUT_MAX_LENGTH } from "@/lib/phone";
import { formatPostTypeLabel } from "@/lib/postType";

export default function AdvertisersList({ onCreateNew }) {
  const [advertisers, setAdvertisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const [revealedPii, setRevealedPii] = useState({});
  const menuRef = useRef(null);

  const maskEmail = (email) => {
    if (!email || !email.includes("@")) return email || "—";
    const [local, domain] = email.split("@");
    return `${local[0]}${"+".repeat(Math.min(local.length - 1, 5))}@${domain}`;
  };

  const maskPhone = (phone) => {
    if (!phone) return "—";
    const digits = phone.replace(/\D/g, "");
    return `(***) ***-${digits.slice(-4) || "????"}`;
  };

  const toggleReveal = (id) => {
    setRevealedPii((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isActiveAdvertiser = (status) =>
    String(status || "active").trim().toLowerCase() === "active";

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

  const confirmDeleteInactive = async () => {
    const inactiveAdvertisers = advertisers.filter(
      (item) => !isActiveAdvertiser(item?.status),
    );
    if (inactiveAdvertisers.length === 0) {
      setBulkDeleteModalOpen(false);
      return;
    }

    setActionLoading(true);
    const failed = [];

    try {
      for (const advertiser of inactiveAdvertisers) {
        try {
          const response = await fetch(`/api/advertisers/${advertiser.id}`, {
            method: "DELETE",
          });
          if (!response.ok) {
            failed.push(advertiser.advertiser_name || advertiser.id);
          }
        } catch (error) {
          console.error("Error deleting inactive advertiser:", error);
          failed.push(advertiser.advertiser_name || advertiser.id);
        }
      }

      await fetchAdvertisers();
      setBulkDeleteModalOpen(false);

      if (failed.length === 0) {
        appToast.success({
          title: "Inactive advertisers deleted",
          description: `${inactiveAdvertisers.length} inactive account(s) were removed completely.`,
        });
        return;
      }

      appToast.warning({
        title: "Some inactive advertisers were not deleted",
        description: `Deleted ${inactiveAdvertisers.length - failed.length} of ${inactiveAdvertisers.length}.`,
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
      String(advertiser?.advertiser_name || "").toLowerCase().includes(query) ||
      String(advertiser?.contact_name || "").toLowerCase().includes(query) ||
      String(advertiser?.email || "").toLowerCase().includes(query)
    );
  });

  const arrangedAdvertisers = [...filteredAdvertisers].sort((left, right) => {
    const leftRank = isActiveAdvertiser(left?.status) ? 0 : 1;
    const rightRank = isActiveAdvertiser(right?.status) ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return String(left?.advertiser_name || "").localeCompare(
      String(right?.advertiser_name || ""),
      "en",
      { sensitivity: "base" },
    );
  });

  const inactiveAdvertiserCount = advertisers.filter(
    (advertiser) => !isActiveAdvertiser(advertiser?.status),
  ).length;

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
          <p className="text-xs text-gray-400 mt-1">
            Inactive means paused. Approved ads for paused advertisers are saved as Draft.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
          <button
            onClick={() => setBulkDeleteModalOpen(true)}
            disabled={inactiveAdvertiserCount === 0 || actionLoading}
            className="px-4 py-2.5 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete inactive ({inactiveAdvertiserCount})
          </button>
          <button
            onClick={onCreateNew}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus size={18} />
            Add new Advertiser
          </button>
        </div>
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

      {/* Table / Grid */}
      {viewMode === "list" ? (
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
              ) : arrangedAdvertisers.length === 0 ? (
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
                arrangedAdvertisers.map((advertiser) => (
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
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span>
                          {revealedPii[advertiser.id] ? advertiser.email : maskEmail(advertiser.email)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleReveal(advertiser.id)}
                          className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                          title={revealedPii[advertiser.id] ? "Hide" : "Reveal"}
                        >
                          {revealedPii[advertiser.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="text-xs text-gray-600">
                        {revealedPii[advertiser.id] ? (advertiser.phone_number || "—") : maskPhone(advertiser.phone_number)}
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
                        className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-medium ${isActiveAdvertiser(advertiser.status)
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                          }`}
                      >
                        {isActiveAdvertiser(advertiser.status) ? "Active" : "Paused"}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {loading ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-500 border border-gray-200 rounded-xl bg-white border-dashed">
              Loading advertisers...
            </div>
          ) : arrangedAdvertisers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-500 border border-gray-200 rounded-xl bg-white border-dashed">
              {searchQuery
                ? "No advertisers found matching your search"
                : "No advertisers yet. Click 'Add new Advertiser' to get started."}
            </div>
          ) : (
            arrangedAdvertisers.map((advertiser) => (
              <div 
                key={advertiser.id}
                className="relative flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700 font-bold text-lg uppercase shadow-sm border border-blue-100">
                      {advertiser.advertiser_name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 truncate max-w-[140px]" title={advertiser.advertiser_name}>
                        {advertiser.advertiser_name}
                      </h4>
                      <div className="text-xs text-gray-500 font-medium truncate max-w-[140px]">
                        {advertiser.contact_name || "No contact name"}
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={(e) => handleMenuClick(advertiser.id, e)}
                      className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <MoreVertical size={16} className="text-gray-400 hover:text-gray-700" />
                    </button>
                    {/* Dropdown Menu */}
                    {openMenuId === advertiser.id && (
                      <div
                        ref={menuRef}
                        className={`absolute ${menuPosition.vertical === "top" ? "bottom-full mb-1" : "top-full mt-1"} right-0 w-36 bg-white border border-gray-200 rounded-lg shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-[100] py-1`}
                      >
                        <button
                          onClick={() => handleView(advertiser.id)}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                        >
                          <Eye size={14} className="text-gray-400" />
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(advertiser)}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors"
                        >
                          <Edit2 size={14} className="text-gray-400" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(advertiser)}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 flex items-center gap-2 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} className="text-red-500" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-4 flex justify-center text-gray-400">@</span>
                    <span className="truncate flex-1">
                      {revealedPii[advertiser.id] ? advertiser.email : maskEmail(advertiser.email)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleReveal(advertiser.id)}
                      className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
                    >
                      {revealedPii[advertiser.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-md p-2 border border-gray-100">
                    <span className="text-gray-400 font-medium">Total Spend</span>
                    <span className="font-bold text-gray-900">{formatCurrency(advertiser.total_spend)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-auto pt-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider shadow-sm border ${isActiveAdvertiser(advertiser.status)
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                  >
                    {isActiveAdvertiser(advertiser.status) ? "Active" : "Paused"}
                  </span>
                  <div className="text-[10px] font-medium text-gray-400">
                    Next ad: <span className="text-gray-600">{formatDate(advertiser.next_ad_date)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

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
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${isActiveAdvertiser(viewModal.advertiser.status)
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {isActiveAdvertiser(viewModal.advertiser.status)
                        ? "Active"
                        : "Paused"}
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
                              {formatPostTypeLabel(ad.post_type)} • {ad.placement} •{" "}
                              {formatDate(ad.post_date_from)}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${ad.status === "scheduled"
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
                  <option value="inactive">Paused</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Paused advertisers can sign in, but newly approved ads are saved as Draft.
                </p>
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
              permanently delete the advertiser account, linked login/profile,
              and all associated ads, invoices, reminders, and pending records.
              This action cannot be undone.
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

      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Delete Inactive Advertisers
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Delete all inactive advertisers ({inactiveAdvertiserCount})? This
              permanently removes their account data and login access so they can
              sign up again from scratch.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setBulkDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteInactive}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-400"
              >
                {actionLoading ? "Deleting..." : "Delete All Inactive"}
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
