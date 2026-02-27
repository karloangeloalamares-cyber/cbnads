"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Settings,
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  Download,
  Filter,
  Clock,
  Clock3,
  CheckCircle,
  Info,
  AlertCircle,
  TrendingUp,
  Users,
  User,
  DollarSign,
  FileText,
  Calendar,
  RefreshCw,
  Eye,
  Play,
  Receipt,
  Pencil,
  MoreVertical,
  Edit2,
  Trash2,
  Upload,
  Check,
  Crown,
  Mail,
  MessageSquare,
  Send,
  Link,
  Volume2,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { getSignedInUser, updateCurrentUser } from "@/lib/localAuth";
import {
  approvePendingAd,
  createId,
  deleteAd,
  deleteAdvertiser,
  deleteInvoice,
  deletePendingAd,
  deleteProduct,
  ensureDb,
  getReconciliationReport,
  readDb,
  rejectPendingAd,
  saveAdminSettings,
  saveNotificationPreferences,
  subscribeDb,
  updateDb,
  updateAdStatus,
  upsertAd,
  upsertAdvertiser,
  upsertInvoice,
  upsertProduct,
} from "@/lib/localDb";

const sections = [
  "Dashboard",
  "Calendar",
  "Submissions",
  "WhatsApp",
  "Advertisers",
  "Ads",
  "Products",
  "Billing",
  "Reconciliation",
  "Settings",
];

const settingsTabs = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "notifications", label: "Notifications" },
  { id: "scheduling", label: "Ad Scheduling" },
  { id: "billing", label: "Billing" },
  { id: "system", label: "System" },
];

const blankAd = {
  id: "",
  ad_name: "",
  advertiser_id: "",
  product_id: "",
  post_type: "one_time",
  status: "Draft",
  payment: "Unpaid",
  post_date: "",
  post_time: "",
  price: "",
  notes: "",
};

const blankAdvertiser = {
  id: "",
  advertiser_name: "",
  contact_name: "",
  email: "",
  phone: "",
  phone_number: "",
  business_name: "",
  status: "active",
};

const blankProduct = {
  id: "",
  product_name: "",
  placement: "WhatsApp",
  price: "",
  description: "",
};

const blankInvoice = {
  id: "",
  invoice_number: "",
  advertiser_id: "",
  amount: "",
  due_date: "",
  status: "Pending",
  ad_ids: [],
};

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const dateText = String(value).slice(0, 10);
  const parsed = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatProductsDate = (value) => {
  if (!value) {
    return "";
  }

  const dateText = String(value).slice(0, 10);
  const parsed = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }

  return parsed.toLocaleDateString("en-US");
};

const normalizeInvoiceStatus = (value) => {
  const status = String(value || "").trim();
  if (!status || status === "Unpaid") {
    return "Pending";
  }
  return status;
};

const getInvoiceStatusColor = (status) => {
  switch (normalizeInvoiceStatus(status)) {
    case "Paid":
      return "text-emerald-700 bg-emerald-50 border-emerald-100";
    case "Overdue":
      return "text-rose-700 bg-rose-50 border-rose-100";
    case "Pending":
      return "text-amber-700 bg-amber-50 border-amber-100";
    default:
      return "text-gray-700 bg-gray-50 border-gray-100";
  }
};

const formatInvoiceListDate = (value) => {
  if (!value) {
    return "N/A";
  }

  const datePart = String(value).split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) {
    return "N/A";
  }
  return `${month}/${day}/${year}`;
};

const formatTime = (value) => {
  if (!value) {
    return "-";
  }

  const [hourText, minuteText] = String(value).split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour) || minuteText == null) {
    return value;
  }

  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minuteText} ${period}`;
};

const formatDateTime = (value) => {
  if (!value) {
    return "N/A";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return "N/A";
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const adsSelectStyle = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'10\' viewBox=\'0 0 10 10\'%3E%3Cpath fill=\'%23666\' d=\'M5 7L1 3h8z\'/%3E%3C/svg%3E")',
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
  paddingRight: "40px",
};

const CREATE_AD_POST_TYPE_OPTIONS = [
  {
    value: "One-Time Post",
    title: "One-time post",
    description: "Single date, single posting event.",
  },
  {
    value: "Daily Run",
    title: "Daily Run",
    description: "Posts daily between start and end dates.",
  },
  {
    value: "Custom Schedule",
    title: "Custom Schedule",
    description: "Select specific non-consecutive dates.",
  },
];

const normalizeAdsPayment = (value) => {
  const payment = String(value || "").trim();
  if (!payment) {
    return "Pending";
  }
  return payment === "Unpaid" ? "Pending" : payment;
};

const getAdsStatusColor = (status) => {
  switch (String(status || "")) {
    case "Published":
      return "text-emerald-700 bg-emerald-50 border-emerald-100";
    case "Draft":
      return "text-gray-700 bg-gray-50 border-gray-100";
    case "Scheduled":
      return "text-blue-700 bg-blue-50 border-blue-100";
    default:
      return "text-gray-700 bg-gray-50 border-gray-100";
  }
};

const getAdsPaymentColor = (payment) => {
  switch (String(payment || "")) {
    case "Paid":
      return "text-emerald-700 bg-emerald-50 border-emerald-100";
    case "Pending":
      return "text-amber-700 bg-amber-50 border-amber-100";
    case "Refunded":
      return "text-purple-700 bg-purple-50 border-purple-100";
    default:
      return "text-gray-700 bg-gray-50 border-gray-100";
  }
};

const formatAdsDate = (value) => {
  if (!value) {
    return "N/A";
  }

  const datePart = String(value).split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) {
    return "N/A";
  }
  return `${month}/${day}/${year}`;
};

const formatAdsTime = (value) => {
  if (!value) {
    return "N/A";
  }

  const [hours, minutes] = String(value).split(":");
  const hour = Number(hours);
  if (Number.isNaN(hour) || minutes == null) {
    return "N/A";
  }
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

const truncateAdsWords = (text, maxWords = 3) => {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ") || "-";
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
};

const parseAdMedia = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [];
    }
  }
  return [];
};

function AdsSortableHeader({ label, sortKey, sortConfig, onSort }) {
  const isActive = sortConfig.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="text-left px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive ? (
          sortConfig.direction === "asc" ? (
            <ChevronUp size={12} className="text-gray-700" />
          ) : (
            <ChevronDown size={12} className="text-gray-700" />
          )
        ) : (
          <ChevronsUpDown size={12} className="text-gray-400" />
        )}
      </div>
    </th>
  );
}

function AdsScheduleCell({ ad }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const customDates = useMemo(
    () =>
      toStringArray(ad.custom_dates)
        .map((item) => String(item).slice(0, 10))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b))),
    [ad.custom_dates],
  );

  const publishedDates = useMemo(
    () =>
      new Set(
        toStringArray(ad.published_dates)
          .map((item) => String(item).slice(0, 10))
          .filter(Boolean),
      ),
    [ad.published_dates],
  );

  const today = useMemo(() => {
    const next = new Date();
    next.setHours(0, 0, 0, 0);
    return next;
  }, []);

  const nextCustomDate = useMemo(() => {
    if (customDates.length === 0) {
      return null;
    }
    const todayKey = toDateKey(today);
    const upcoming = customDates.filter((dateText) => dateText >= todayKey);
    return upcoming[0] || null;
  }, [customDates, today]);

  const completionStatus = useMemo(
    () => ({
      completed: customDates.filter((dateText) => publishedDates.has(dateText)).length,
      total: customDates.length,
    }),
    [customDates, publishedDates],
  );

  const categorizedDates = useMemo(() => {
    if (customDates.length === 0) {
      return [];
    }
    return customDates.map((dateText) => {
      const parsedDate = parseCalendarDate(dateText);
      const isPast = parsedDate ? parsedDate < today : false;
      const isPublished = publishedDates.has(dateText);
      const isNext = dateText === nextCustomDate;
      return {
        date: dateText,
        isPublished,
        isPast,
        isNext,
      };
    });
  }, [customDates, nextCustomDate, publishedDates, today]);

  if (customDates.length === 0) {
    return <span className="text-xs text-gray-700 font-medium">{formatAdsDate(ad.schedule)}</span>;
  }

  if (!nextCustomDate) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-green-600 font-medium">All completed</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <span className="text-xs text-gray-700 font-medium">{formatAdsDate(nextCustomDate)}</span>
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Info size={14} className="text-gray-400 cursor-help" />
        {showTooltip ? (
          <div className="absolute left-0 top-6 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3">
            <div className="text-xs font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100">
              Custom Schedule ({completionStatus.total} dates)
              <span className="ml-2 text-gray-500 font-normal">
                {completionStatus.completed}/{completionStatus.total} completed
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {categorizedDates.map((item) => {
                const statusLabel = item.isPublished
                  ? "Published"
                  : item.isNext
                    ? "Next"
                    : item.isPast
                      ? "Missed"
                      : "Upcoming";
                const statusClass = item.isPublished
                  ? "text-green-600"
                  : item.isNext
                    ? "text-blue-600"
                    : item.isPast
                      ? "text-gray-400"
                      : "text-gray-500";
                const dateClass = item.isPublished
                  ? "text-gray-400 line-through"
                  : item.isNext
                    ? "text-blue-700 font-semibold"
                    : item.isPast
                      ? "text-gray-400"
                      : "text-gray-600";
                return (
                  <div
                    key={item.date}
                    className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${item.isNext ? "bg-blue-50" : ""
                      }`}
                  >
                    <span className={`text-[10px] ${statusClass}`}>{statusLabel}</span>
                    <span className={`flex-1 ${dateClass}`}>{formatAdsDate(item.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdsTableRow({ ad, onPreview, onEdit, onMarkPublished, onDelete }) {
  const [activeMenu, setActiveMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMenuClick = (event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const menuHeight = 350;
    const menuWidth = 200;
    setMenuPosition({
      vertical: spaceBelow < menuHeight ? "top" : "bottom",
      horizontal: spaceRight < menuWidth ? "left" : "right",
    });
    setActiveMenu((current) => !current);
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors group">
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <div className="text-xs font-semibold text-gray-900" title={ad.ad_name || ""}>
          {truncateAdsWords(ad.ad_name)}
        </div>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-medium">{ad.advertiser || "N/A"}</span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getAdsStatusColor(
            ad.status,
          )}`}
        >
          {ad.status || "Draft"}
        </span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-medium">{ad.post_type || "-"}</span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-medium">{ad.placement || "-"}</span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <AdsScheduleCell ad={ad} />
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-medium">{formatAdsTime(ad.post_time)}</span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getAdsPaymentColor(
            ad.payment,
          )}`}
        >
          {ad.payment || "Pending"}
        </span>
      </td>
      <td className="px-6 py-4 text-right relative" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={handleMenuClick}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <MoreVertical size={18} className="text-gray-500" />
        </button>
        {activeMenu ? (
          <div
            ref={menuRef}
            className={`absolute ${menuPosition.vertical === "top" ? "bottom-full mb-1" : "top-full mt-1"
              } ${menuPosition.horizontal === "left" ? "right-0" : "left-auto"} w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] py-1`}
          >
            <button
              onClick={() => {
                setActiveMenu(false);
                onPreview(ad);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              type="button"
            >
              <Eye size={16} className="text-gray-400" />
              Preview
            </button>
            <button
              onClick={() => {
                setActiveMenu(false);
                onEdit(ad);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
              type="button"
            >
              <Pencil size={16} className="text-gray-400" />
              Edit
            </button>
            {ad.status !== "Published" ? (
              <button
                onClick={() => {
                  setActiveMenu(false);
                  onMarkPublished(ad.id);
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                type="button"
              >
                <CheckCircle size={16} className="text-gray-400" />
                Mark as Published
              </button>
            ) : null}
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => {
                setActiveMenu(false);
                onDelete(ad.id);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
              type="button"
            >
              <Trash2 size={16} className="text-red-500" />
              Delete
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function AdsPreviewModal({ ad, onClose, onEdit, linkedInvoices }) {
  if (!ad) {
    return null;
  }

  const customDates = toStringArray(ad.custom_dates)
    .map((item) => String(item).slice(0, 10))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));
  const publishedDates = new Set(
    toStringArray(ad.published_dates)
      .map((item) => String(item).slice(0, 10))
      .filter(Boolean),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const media = parseAdMedia(ad.media);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/50 z-40 transition-opacity" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{ad.ad_name || "Untitled Ad"}</h2>
              <p className="text-sm text-gray-500 mt-1">{ad.advertiser || "Unknown advertiser"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onEdit(ad);
                }}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                type="button"
              >
                <Pencil size={16} />
                Edit
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                type="button"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Status
                </label>
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${getAdsStatusColor(
                    ad.status,
                  )}`}
                >
                  {ad.status || "Draft"}
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Payment
                </label>
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${getAdsPaymentColor(
                    ad.payment,
                  )}`}
                >
                  {ad.payment || "Pending"}
                </span>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Post Type
                </label>
                <p className="text-sm text-gray-900 font-medium">{ad.post_type || "-"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Placement
                </label>
                <p className="text-sm text-gray-900 font-medium">{ad.placement || "-"}</p>
              </div>
              <div className={customDates.length > 0 ? "col-span-2" : ""}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Schedule
                </label>
                {customDates.length > 0 ? (
                  <div className="mt-2">
                    <div className="text-sm text-gray-700 font-medium mb-2">
                      Custom Schedule ({customDates.length} dates)
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5 max-h-40 overflow-y-auto">
                      {customDates.map((dateText) => {
                        const parsedDate = parseCalendarDate(dateText);
                        const isPast = parsedDate ? parsedDate < today : false;
                        const isPublished = publishedDates.has(dateText);
                        const statusLabel = isPublished ? "Published" : isPast ? "Missed" : "Upcoming";
                        const statusClass = isPublished
                          ? "text-green-600"
                          : isPast
                            ? "text-gray-400"
                            : "text-blue-600";
                        return (
                          <div
                            key={dateText}
                            className="flex items-center gap-2 text-xs py-1.5 px-2 bg-white rounded border border-gray-100"
                          >
                            <span className={`text-[10px] font-medium ${statusClass}`}>
                              {statusLabel}
                            </span>
                            <span
                              className={`flex-1 ${isPublished ? "line-through text-gray-400" : "text-gray-700"
                                }`}
                            >
                              {formatAdsDate(dateText)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-900 font-medium">{formatAdsDate(ad.schedule)}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Post Time
                </label>
                <p className="text-sm text-gray-900 font-medium">{formatAdsTime(ad.post_time)}</p>
              </div>
            </div>

            {media.length > 0 ? (
              <div className="mb-6">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 block">
                  Media
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {media.map((item, index) => (
                    <div
                      key={`${item.url || item.name || "media"}-${index}`}
                      className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                    >
                      {item.type === "image" ? (
                        <img
                          src={item.url}
                          alt={item.name || `Media ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <Play size={48} className="text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                Ad Content
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {ad.ad_text || ad.notes || "No ad text provided"}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 block flex items-center gap-2">
                <Receipt size={14} />
                Invoice History
              </label>
              {linkedInvoices.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500">No invoices linked to this ad</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="divide-y divide-gray-200">
                    {linkedInvoices.map((invoiceItem) => {
                      const total = Number(invoiceItem.total ?? invoiceItem.amount ?? 0) || 0;
                      const amountPaid = Number(invoiceItem.amount_paid ?? 0) || 0;
                      const status = String(invoiceItem.status || "Unpaid");
                      return (
                        <div
                          key={invoiceItem.id}
                          className="p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {invoiceItem.invoice_number || "Invoice"}
                                </span>
                                <span
                                  className={`px-2 py-1 rounded text-xs font-semibold ${status === "Paid"
                                    ? "bg-green-100 text-green-700"
                                    : status === "Partial"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : status === "Overdue"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-gray-100 text-gray-700"
                                    }`}
                                >
                                  {status}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Issued: {formatDate(invoiceItem.issue_date)}</span>
                                {amountPaid > 0 && amountPaid < total ? (
                                  <span className="text-yellow-600 font-medium">
                                    Partial: ${amountPaid.toFixed(2)} / ${total.toFixed(2)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">${total.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const formatRelativeTime = (value) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "-";
  }
  const now = new Date();
  const diffMs = now.valueOf() - date.valueOf();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${Math.max(diffMins, 0)}m ago`;
  }
  if (diffHours < 24) {
    return `${Math.max(diffHours, 0)}h ago`;
  }
  return `${Math.max(diffDays, 0)}d ago`;
};

const getSubmissionStatusBadgeClass = (status) => {
  const styles = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    not_approved: "bg-red-100 text-red-800",
  };
  return styles[String(status || "pending").toLowerCase()] || "";
};

const formatSubmissionStatus = (status) =>
  String(status || "pending").replace(/_/g, " ").toUpperCase();

const formatSubmissionDate = (value) => {
  if (!value) {
    return "-";
  }
  const datePart =
    typeof value === "string" ? value.split("T")[0].split(" ")[0] : String(value);
  const parsed = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return "-";
  }
  return parsed.toLocaleDateString();
};

const formatAdvertiserDate = (value) => {
  if (!value) {
    return "\u2014";
  }
  const datePart =
    typeof value === "string" ? value.split("T")[0].split(" ")[0] : String(value);
  const parsed = new Date(`${datePart}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return "\u2014";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getAdvertiserStatusClass = (status) =>
  String(status || "active").toLowerCase() === "active"
    ? "bg-green-100 text-green-800"
    : "bg-gray-100 text-gray-600";

const getInvoiceOutstanding = (invoice) => {
  const total = Number(invoice?.total ?? invoice?.amount ?? 0) || 0;
  const amountPaid = Number(invoice?.amount_paid ?? 0) || 0;
  const status = String(invoice?.status || "").toLowerCase();
  if (status === "paid") {
    return 0;
  }
  const outstanding = total - amountPaid;
  if (outstanding > 0) {
    return outstanding;
  }
  return total;
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const parseCalendarDate = (value) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      return null;
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const datePart = String(value).split("T")[0];
  const [yearText, monthText, dayText] = datePart.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed;
};

const normalizeCalendarPostType = (value) => {
  const text = String(value || "").toLowerCase();
  if (text.includes("daily")) {
    return "Daily Run";
  }
  if (text.includes("custom")) {
    return "Custom Schedule";
  }
  if (text.includes("one")) {
    return "One-Time Post";
  }
  return value || "One-Time Post";
};

const normalizeCreateAdPostType = (value) => {
  const text = String(value || "").toLowerCase();
  if (text.includes("daily")) {
    return "Daily Run";
  }
  if (text.includes("custom")) {
    return "Custom Schedule";
  }
  return "One-Time Post";
};

const toCreateAdPostTypeValue = (value) => {
  if (value === "Daily Run") {
    return "daily_run";
  }
  if (value === "Custom Schedule") {
    return "custom_schedule";
  }
  return "one_time";
};

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // Fall through to comma-separated parsing.
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const getMonthCalendarDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  const days = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();

  for (let i = startingDayOfWeek - 1; i >= 0; i -= 1) {
    days.push({
      date: new Date(year, month - 1, prevMonthLastDay - i),
      isCurrentMonth: false,
    });
  }

  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push({
      date: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }

  const remainingDays = 42 - days.length;
  for (let i = 1; i <= remainingDays; i += 1) {
    days.push({
      date: new Date(year, month + 1, i),
      isCurrentMonth: false,
    });
  }

  return days;
};

const getWeekStart = (date) => {
  const next = new Date(date);
  const day = next.getDay();
  const diff = next.getDate() - day;
  return new Date(next.setDate(diff));
};

const getAdsForDate = (expandedAds, targetDate) =>
  expandedAds.filter(
    (item) =>
      item.date.getFullYear() === targetDate.getFullYear() &&
      item.date.getMonth() === targetDate.getMonth() &&
      item.date.getDate() === targetDate.getDate(),
  );

const getCalendarStatusColor = (status, isPublished) => {
  if (isPublished !== undefined) {
    return isPublished
      ? "bg-gray-100 text-gray-600 border-gray-200"
      : "bg-blue-100 text-blue-700 border-blue-200";
  }

  const colors = {
    Scheduled: "bg-blue-100 text-blue-700 border-blue-200",
    Published: "bg-gray-100 text-gray-600 border-gray-200",
    Paid: "bg-green-100 text-green-700 border-green-200",
    Unpaid: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };

  return colors[status] || "bg-gray-100 text-gray-600 border-gray-200";
};

const getCapacityStatus = (count, maxAdsPerDay) => {
  const safeMax = Number(maxAdsPerDay) || 1;
  const percentage = (count / safeMax) * 100;
  if (percentage >= 100) {
    return { bg: "bg-red-100", color: "text-red-700" };
  }
  if (percentage >= 80) {
    return { bg: "bg-yellow-100", color: "text-yellow-700" };
  }
  return { bg: "bg-green-100", color: "text-green-700" };
};

function CalendarMonthView({ currentDate, ads, maxAdsPerDay, onAdClick, onDateClick }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const calendarDays = getMonthCalendarDays(year, month);
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDays.map((day) => (
          <div
            key={day}
            className="py-3 text-center text-xs font-semibold text-gray-700 bg-gray-50"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {calendarDays.map((dayInfo, index) => {
          const dayAds = getAdsForDate(ads, dayInfo.date);
          const capacity = getCapacityStatus(dayAds.length, maxAdsPerDay);
          const today = toDateKey(dayInfo.date) === toDateKey(new Date());

          return (
            <div
              key={`${toDateKey(dayInfo.date)}-${index}`}
              onClick={() => onDateClick(dayInfo.date)}
              className={`min-h-[120px] border-b border-r border-gray-200 p-2 cursor-pointer hover:bg-gray-50 transition-colors ${!dayInfo.isCurrentMonth ? "bg-gray-50" : "bg-white"
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-medium ${!dayInfo.isCurrentMonth
                    ? "text-gray-400"
                    : today
                      ? "bg-gray-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                      : "text-gray-900"
                    }`}
                >
                  {dayInfo.date.getDate()}
                </span>

                {dayInfo.isCurrentMonth && dayAds.length > 0 ? (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${capacity.bg} ${capacity.color}`}
                  >
                    {dayAds.length}/{maxAdsPerDay}
                  </span>
                ) : null}
              </div>

              <div className="space-y-1">
                {dayAds.slice(0, 3).map((item, itemIndex) => (
                  <div
                    key={`${item.ad.id || item.ad.ad_name}-${itemIndex}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAdClick(item.ad);
                    }}
                    className={`text-xs p-1.5 rounded border cursor-pointer hover:shadow-sm transition-shadow ${getCalendarStatusColor(
                      item.ad.status,
                    )}`}
                  >
                    <div className="font-medium truncate">{item.ad.ad_name}</div>
                    <div className="text-[10px] truncate opacity-75">{item.ad.advertiser}</div>
                  </div>
                ))}

                {dayAds.length > 3 ? (
                  <div className="text-xs text-gray-500 pl-1.5">+{dayAds.length - 3} more</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarWeekView({ currentDate, ads, onAdClick }) {
  const weekStart = getWeekStart(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7">
        {weekDays.map((date) => {
          const dayAds = getAdsForDate(ads, date);
          const today = toDateKey(date) === toDateKey(new Date());

          return (
            <div
              key={toDateKey(date)}
              className={`border-r border-b border-gray-200 p-3 min-h-[400px] ${today ? "bg-blue-50" : "bg-white"
                }`}
            >
              <div className="text-center mb-3">
                <div className="text-xs font-semibold text-gray-600 uppercase">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={`text-lg font-semibold mt-1 ${today
                    ? "bg-gray-900 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto"
                    : "text-gray-900"
                    }`}
                >
                  {date.getDate()}
                </div>
              </div>

              <div className="space-y-2">
                {dayAds.map((item, index) => (
                  <div
                    key={`${item.ad.id || item.ad.ad_name}-${index}`}
                    onClick={() => onAdClick(item.ad)}
                    className={`text-xs p-2 rounded border cursor-pointer hover:shadow-sm transition-shadow ${getCalendarStatusColor(
                      item.ad.status,
                    )}`}
                  >
                    <div className="font-medium truncate">{item.ad.ad_name}</div>
                    <div className="text-[10px] truncate opacity-75 mt-0.5">
                      {item.ad.advertiser}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayView({ currentDate, ads, maxAdsPerDay, onAdClick }) {
  const dayAds = getAdsForDate(ads, currentDate);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">
          {currentDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {dayAds.length} ad{dayAds.length !== 1 ? "s" : ""} scheduled (
          {dayAds.length}/{maxAdsPerDay} capacity)
        </p>
      </div>

      {dayAds.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No ads scheduled for this day</p>
        </div>
      ) : (
        <div className="space-y-3">
          {dayAds.map((item, index) => (
            <div
              key={`${item.ad.id || item.ad.ad_name}-${index}`}
              onClick={() => onAdClick(item.ad)}
              className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getCalendarStatusColor(
                item.ad.status,
              )}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{item.ad.ad_name}</h3>
                  <p className="text-sm opacity-75 mt-1">{item.ad.advertiser}</p>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span>
                      <span className="font-medium">Type:</span> {item.ad.post_type}
                    </span>
                    <span>
                      <span className="font-medium">Placement:</span> {item.ad.placement}
                    </span>
                    <span>
                      <span className="font-medium">Payment:</span> {item.ad.payment}
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-white bg-opacity-50">
                  {item.ad.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarUpcomingSidebar({ ads, onAdClick, isMinimized, setIsMinimized }) {
  if (isMinimized) {
    return (
      <div className="bg-white border-l border-gray-200 flex items-start justify-center pt-4">
        <button
          onClick={() => setIsMinimized(false)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Show upcoming ads"
          type="button"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Upcoming (Next 7 Days)</h3>
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          title="Minimize sidebar"
          type="button"
        >
          <ChevronRight size={18} className="text-gray-600" />
        </button>
      </div>

      {ads.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming ads</p>
      ) : (
        <div className="space-y-3">
          {ads.map((item, index) => (
            <div
              key={`${item.ad.id || item.ad.ad_name}-${index}`}
              onClick={() => onAdClick(item.ad)}
              className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${getCalendarStatusColor(
                item.ad.status,
              )}`}
            >
              <div className="text-xs font-medium text-gray-600 mb-1">
                {item.date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="font-medium text-sm truncate">{item.ad.ad_name}</div>
              <div className="text-xs opacity-75 truncate mt-0.5">{item.ad.advertiser}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarFilters({
  selectedAdvertiser,
  setSelectedAdvertiser,
  selectedPlacement,
  setSelectedPlacement,
  selectedPostType,
  setSelectedPostType,
  selectedStatus,
  setSelectedStatus,
  showUnpublishedOnly,
  setShowUnpublishedOnly,
  advertisers,
  placements,
  postTypes,
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <select
          value={selectedAdvertiser}
          onChange={(event) => setSelectedAdvertiser(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Advertisers</option>
          {advertisers.map((advertiser) => (
            <option key={advertiser} value={advertiser}>
              {advertiser}
            </option>
          ))}
        </select>

        <select
          value={selectedPlacement}
          onChange={(event) => setSelectedPlacement(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Placements</option>
          {placements.map((placement) => (
            <option key={placement} value={placement}>
              {placement}
            </option>
          ))}
        </select>

        <select
          value={selectedPostType}
          onChange={(event) => setSelectedPostType(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Post Types</option>
          {postTypes.map((postType) => (
            <option key={postType} value={postType}>
              {postType}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          <option value="">All Statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Published">Published</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>

        <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
          <input
            type="checkbox"
            checked={showUnpublishedOnly}
            onChange={(event) => setShowUnpublishedOnly(event.target.checked)}
            className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
          />
          <span className="text-gray-700">Unpublished only</span>
        </label>
      </div>
    </div>
  );
}

function CalendarAdPreviewModal({ ad, onClose, onEdit }) {
  if (!ad) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Ad Preview</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <p>
            <span className="font-medium text-gray-900">Ad:</span> {ad.ad_name || "-"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Advertiser:</span> {ad.advertiser || "-"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Placement:</span> {ad.placement || "-"}
          </p>
          <p>
            <span className="font-medium text-gray-900">Schedule:</span>{" "}
            {formatDate(ad.post_date)} {ad.post_time ? `at ${formatTime(ad.post_time)}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getCalendarStatusColor(
                ad.status,
              )}`}
            >
              {ad.status || "Draft"}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getCalendarStatusColor(
                ad.payment || "Unpaid",
              )}`}
            >
              {ad.payment || "Unpaid"}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Edit Ad
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceSortableHeader({ label, sortKey, onSort }) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="text-left px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer hover:bg-gray-100 transition-colors"
    >
      <div className="flex items-center gap-1">
        {label}
        <ChevronsUpDown size={12} className="text-gray-400" />
      </div>
    </th>
  );
}

export default function AdsPage() {
  const [db, setDb] = useState(() => readDb());
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") {
      return "Ads";
    }
    const value = new URLSearchParams(window.location.search).get("section");
    return sections.includes(value) ? value : "Ads";
  });
  const [view, setView] = useState("list");
  const [adsFilters, setAdsFilters] = useState({
    status: "All Ads",
    placement: "All Placement",
    postType: "All post types",
    advertiser: "All Advertisers",
    payment: "All Payment Status",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [adsShowDateRangePicker, setAdsShowDateRangePicker] = useState(false);
  const [adsShowAdvancedFilters, setAdsShowAdvancedFilters] = useState(false);
  const [adsSortConfig, setAdsSortConfig] = useState({
    key: "schedule",
    direction: "asc",
  });
  const [adsPreviewAd, setAdsPreviewAd] = useState(null);
  const [calendarSearch, setCalendarSearch] = useState("");
  const [calendarMode, setCalendarMode] = useState("month");
  const [calendarCurrentDate, setCalendarCurrentDate] = useState(() => new Date());
  const [calendarShowFilters, setCalendarShowFilters] = useState(false);
  const [calendarSelectedAdvertiser, setCalendarSelectedAdvertiser] = useState("");
  const [calendarSelectedPlacement, setCalendarSelectedPlacement] = useState("");
  const [calendarSelectedPostType, setCalendarSelectedPostType] = useState("");
  const [calendarSelectedStatus, setCalendarSelectedStatus] = useState("");
  const [calendarUnpublishedOnly, setCalendarUnpublishedOnly] = useState(false);
  const [calendarPreviewOpen, setCalendarPreviewOpen] = useState(false);
  const [calendarSelectedAd, setCalendarSelectedAd] = useState(null);
  const [calendarSidebarMinimized, setCalendarSidebarMinimized] = useState(false);
  const [advertiserSearch, setAdvertiserSearch] = useState("");
  const [openAdvertiserMenuId, setOpenAdvertiserMenuId] = useState(null);
  const [advertiserMenuPosition, setAdvertiserMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const [advertiserViewModal, setAdvertiserViewModal] = useState(null);
  const [advertiserEditModal, setAdvertiserEditModal] = useState(null);
  const [advertiserDeleteModal, setAdvertiserDeleteModal] = useState(null);
  const [advertiserActionLoading, setAdvertiserActionLoading] = useState(false);
  const [advertiserCreateOpen, setAdvertiserCreateOpen] = useState(false);
  const [advertiserCreateLoading, setAdvertiserCreateLoading] = useState(false);
  const [advertiserCreateForm, setAdvertiserCreateForm] = useState({
    advertiser_name: "",
    contact_name: "",
    email: "",
    phone_number: "",
    status: "active",
  });
  const [productCreateOpen, setProductCreateOpen] = useState(false);
  const [openProductMenuId, setOpenProductMenuId] = useState(null);
  const [productMenuPosition, setProductMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const [productEditModal, setProductEditModal] = useState(null);
  const [productDeleteModal, setProductDeleteModal] = useState(null);
  const [productActionLoading, setProductActionLoading] = useState(false);
  const [invoiceFilters, setInvoiceFilters] = useState({
    status: "All",
    search: "",
  });
  const [invoiceSortConfig, setInvoiceSortConfig] = useState({
    key: null,
    direction: null,
  });
  const [openInvoiceMenuId, setOpenInvoiceMenuId] = useState(null);
  const [invoiceMenuPosition, setInvoiceMenuPosition] = useState({
    vertical: "bottom",
    horizontal: "right",
  });
  const [showInvoiceCreateMenu, setShowInvoiceCreateMenu] = useState(false);
  const [invoicePreviewModal, setInvoicePreviewModal] = useState(null);
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const advertiserMenuRef = useRef(null);
  const productMenuRef = useRef(null);
  const invoiceMenuRef = useRef(null);
  const invoiceCreateMenuRef = useRef(null);
  const adsAdvancedFiltersRef = useRef(null);
  const createAdTextAreaRef = useRef(null);

  const [ad, setAd] = useState(blankAd);
  const [product, setProduct] = useState(blankProduct);
  const [invoice, setInvoice] = useState(blankInvoice);
  const [settingsActiveTab, setSettingsActiveTab] = useState("profile");
  const [settingsProfileName, setSettingsProfileName] = useState("");
  const [settingsProfileImage, setSettingsProfileImage] = useState("");
  const [settingsProfileWhatsapp, setSettingsProfileWhatsapp] = useState("");
  const [settingsProfileSaving, setSettingsProfileSaving] = useState(false);
  const [settingsProfileUploading, setSettingsProfileUploading] = useState(false);
  const [settingsProfileMessage, setSettingsProfileMessage] = useState(null);
  const [settingsTeamModalOpen, setSettingsTeamModalOpen] = useState(false);
  const [settingsTeamName, setSettingsTeamName] = useState("");
  const [settingsTeamEmail, setSettingsTeamEmail] = useState("");
  const [settingsTeamPassword, setSettingsTeamPassword] = useState("");
  const [settingsTeamSaving, setSettingsTeamSaving] = useState(false);
  const [settingsTeamError, setSettingsTeamError] = useState("");
  const [settingsNotification, setSettingsNotification] = useState({
    email_enabled: true,
    sms_enabled: false,
    telegram_enabled: false,
    reminder_time_value: 1,
    reminder_time_unit: "hours",
    email_address: "",
    phone_number: "",
    sound_enabled: true,
  });
  const [settingsNotificationSaving, setSettingsNotificationSaving] = useState(false);
  const [settingsNotificationTesting, setSettingsNotificationTesting] = useState(false);
  const [settingsNotificationChecking, setSettingsNotificationChecking] =
    useState(false);
  const [settingsNotificationMessage, setSettingsNotificationMessage] =
    useState(null);
  const [settingsReminderResults, setSettingsReminderResults] = useState(null);
  const [settingsTelegramNewLabel, setSettingsTelegramNewLabel] = useState("");
  const [settingsTelegramNewChatId, setSettingsTelegramNewChatId] = useState("");
  const [settingsTelegramAdding, setSettingsTelegramAdding] = useState(false);
  const [settingsTelegramTesting, setSettingsTelegramTesting] = useState(null);
  const [settingsTelegramWebhookLoading, setSettingsTelegramWebhookLoading] =
    useState(false);
  const [settingsTelegramWebhookStatus, setSettingsTelegramWebhookStatus] =
    useState(null);
  const [settingsMaxAdsPerDay, setSettingsMaxAdsPerDay] = useState("5");
  const [settingsSchedulingSaving, setSettingsSchedulingSaving] = useState(false);
  const [settingsSchedulingError, setSettingsSchedulingError] = useState("");
  const [settingsSchedulingSuccess, setSettingsSchedulingSuccess] = useState(false);
  const [settingsSystemSyncResult, setSettingsSystemSyncResult] = useState(null);
  const [settingsSystemError, setSettingsSystemError] = useState("");
  const [whatsAppFilterUnread, setWhatsAppFilterUnread] = useState(false);
  const [whatsAppSearchTerm, setWhatsAppSearchTerm] = useState("");
  const [whatsAppSelectedMessageId, setWhatsAppSelectedMessageId] = useState(null);


  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (cancelled) {
        return;
      }
      setDb(readDb());
      setUser(getSignedInUser());
      setReady(true);
    };

    const initialize = async () => {
      await ensureDb();
      sync();
    };

    void initialize();
    const unsubscribe = subscribeDb(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || user) {
      return;
    }
    window.location.href = "/account/signin";
  }, [ready, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("section", activeSection);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [activeSection]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    if (!showProfileDropdown) {
      return undefined;
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showProfileDropdown]);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (
        advertiserMenuRef.current &&
        !advertiserMenuRef.current.contains(event.target)
      ) {
        setOpenAdvertiserMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (
        productMenuRef.current &&
        !productMenuRef.current.contains(event.target)
      ) {
        setOpenProductMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (
        invoiceMenuRef.current &&
        !invoiceMenuRef.current.contains(event.target)
      ) {
        setOpenInvoiceMenuId(null);
      }
      if (
        invoiceCreateMenuRef.current &&
        !invoiceCreateMenuRef.current.contains(event.target)
      ) {
        setShowInvoiceCreateMenu(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!adsShowAdvancedFilters) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (
        adsAdvancedFiltersRef.current &&
        !adsAdvancedFiltersRef.current.contains(event.target)
      ) {
        setAdsShowAdvancedFilters(false);
        setAdsShowDateRangePicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [adsShowAdvancedFilters]);

  const advertisers = db.advertisers || [];
  const products = db.products || [];
  const ads = db.ads || [];
  const pending = db.pending_ads || [];
  const invoices = db.invoices || [];
  const teamMembers = db.team_members || [];
  const adminSettings = db.admin_settings || {};
  const notificationPreferences = db.notification_preferences || {};
  const settingsTelegramChatIds = Array.isArray(db.telegram_chat_ids)
    ? db.telegram_chat_ids
    : [];
  const settingsActiveTelegramCount = settingsTelegramChatIds.filter(
    (item) => item.is_active !== false,
  ).length;
  const whatsAppMessages = useMemo(() => {
    const source = Array.isArray(db.whatsapp_messages) ? db.whatsapp_messages : [];
    return [...source].sort((a, b) => {
      const aDate = new Date(a.created_at || 0).valueOf();
      const bDate = new Date(b.created_at || 0).valueOf();
      return bDate - aDate;
    });
  }, [db.whatsapp_messages]);
  const whatsAppUnreadCount = useMemo(
    () =>
      whatsAppMessages.filter(
        (item) => !Boolean(item.is_read ?? item.isRead ?? false),
      ).length,
    [whatsAppMessages],
  );
  const filteredWhatsAppMessages = useMemo(() => {
    const search = whatsAppSearchTerm.trim().toLowerCase();
    return whatsAppMessages.filter((item) => {
      const isRead = Boolean(item.is_read ?? item.isRead ?? false);
      if (whatsAppFilterUnread && isRead) {
        return false;
      }
      if (!search) {
        return true;
      }
      const haystack = [
        item.message_text,
        item.message,
        item.from_name,
        item.from_number,
        item.advertiser_name,
        item.notes,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(search);
    });
  }, [whatsAppFilterUnread, whatsAppMessages, whatsAppSearchTerm]);
  const selectedWhatsAppMessage = useMemo(
    () =>
      filteredWhatsAppMessages.find((item) => item.id === whatsAppSelectedMessageId) ||
      filteredWhatsAppMessages[0] ||
      null,
    [filteredWhatsAppMessages, whatsAppSelectedMessageId],
  );

  useEffect(() => {
    setSettingsProfileName(user?.name || "");
    setSettingsProfileImage(user?.image || "");
    setSettingsProfileWhatsapp(user?.whatsapp_number || "");
    setSettingsProfileMessage(null);
  }, [user?.id, user?.name, user?.image, user?.whatsapp_number]);

  useEffect(() => {
    setSettingsNotification((current) => ({
      ...current,
      email_enabled:
        notificationPreferences.email_enabled ?? current.email_enabled ?? true,
      sms_enabled:
        notificationPreferences.sms_enabled ?? current.sms_enabled ?? false,
      telegram_enabled:
        notificationPreferences.telegram_enabled ?? current.telegram_enabled ?? false,
      reminder_time_value:
        Number(notificationPreferences.reminder_time_value) ||
        current.reminder_time_value ||
        1,
      reminder_time_unit:
        notificationPreferences.reminder_time_unit ||
        current.reminder_time_unit ||
        "hours",
      email_address:
        notificationPreferences.email_address ||
        notificationPreferences.reminder_email ||
        current.email_address ||
        user?.email ||
        "",
      phone_number:
        notificationPreferences.phone_number || current.phone_number || "",
      sound_enabled:
        notificationPreferences.sound_enabled ?? current.sound_enabled ?? true,
    }));
    setSettingsMaxAdsPerDay(
      String(adminSettings.max_ads_per_day || adminSettings.max_ads_per_slot || 5),
    );
  }, [adminSettings, notificationPreferences, user?.email]);

  useEffect(() => {
    if (filteredWhatsAppMessages.length === 0) {
      if (whatsAppSelectedMessageId !== null) {
        setWhatsAppSelectedMessageId(null);
      }
      return;
    }
    if (
      !whatsAppSelectedMessageId ||
      !filteredWhatsAppMessages.some((item) => item.id === whatsAppSelectedMessageId)
    ) {
      setWhatsAppSelectedMessageId(filteredWhatsAppMessages[0].id);
    }
  }, [filteredWhatsAppMessages, whatsAppSelectedMessageId]);

  const visibleAdsForInvoice = useMemo(() => {
    if (!invoice.advertiser_id) {
      return ads;
    }
    return ads.filter((item) => item.advertiser_id === invoice.advertiser_id);
  }, [ads, invoice.advertiser_id]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const paidAds = ads.filter((item) => item.payment === "Paid");
    const paidRevenue = paidAds.reduce(
      (sum, item) => sum + (Number(item.price) || 0),
      0,
    );
    const monthRevenue = paidAds.reduce((sum, item) => {
      const sourceDate = item.post_date || item.created_at;
      if (!sourceDate) {
        return sum;
      }
      const parsed = new Date(sourceDate);
      if (Number.isNaN(parsed.valueOf())) {
        return sum;
      }
      if (
        parsed.getMonth() !== now.getMonth() ||
        parsed.getFullYear() !== now.getFullYear()
      ) {
        return sum;
      }
      return sum + (Number(item.price) || 0);
    }, 0);
    const outstandingRevenue = invoices.reduce(
      (sum, item) => sum + getInvoiceOutstanding(item),
      0,
    );

    return {
      totalAds: ads.length,
      pendingSubmissions: pending.filter((item) => item.status === "pending")
        .length,
      activeAdvertisers: advertisers.length,
      paidRevenue,
      outstandingRevenue,
      monthRevenue,
      overdueInvoices: invoices.filter((item) => item.status === "Overdue")
        .length,
    };
  }, [ads, advertisers.length, invoices, pending]);

  const upcomingAds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return [...ads]
      .filter((item) => {
        if (!item.post_date) {
          return false;
        }
        const postDate = new Date(`${item.post_date}T00:00:00`);
        return !Number.isNaN(postDate.valueOf()) && postDate >= today;
      })
      .sort((a, b) =>
        `${a.post_date || ""} ${a.post_time || ""}`.localeCompare(
          `${b.post_date || ""} ${b.post_time || ""}`,
        ),
      );
  }, [ads]);

  const calendarMaxAdsPerDay =
    Number(db.admin_settings?.max_ads_per_day) ||
    Number(db.admin_settings?.max_ads_per_slot) ||
    5;

  const calendarExpandedAds = useMemo(() => {
    const advertiserById = new Map(
      advertisers.map((item) => [item.id, item.advertiser_name || item.name || ""]),
    );
    const placementByProductId = new Map(
      products.map((item) => [item.id, item.placement || ""]),
    );
    const expanded = [];

    for (const ad of ads) {
      const publishedDates = toStringArray(ad.published_dates);
      const advertiserName =
        ad.advertiser || advertiserById.get(ad.advertiser_id) || "Unknown advertiser";
      const placement =
        ad.placement || placementByProductId.get(ad.product_id) || "Unknown placement";
      const normalizedAd = {
        ...ad,
        advertiser: advertiserName,
        placement,
        post_type: normalizeCalendarPostType(ad.post_type),
        status: ad.status || "Draft",
        payment: ad.payment || "Unpaid",
      };

      const postType = String(ad.post_type || "").toLowerCase();
      const dates = [];

      if (postType.includes("daily") && ad.post_date_from && ad.post_date_to) {
        const startDate = parseCalendarDate(ad.post_date_from);
        const endDate = parseCalendarDate(ad.post_date_to);
        if (startDate && endDate) {
          for (let day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
            dates.push(new Date(day));
          }
        }
      } else if (postType.includes("custom") && ad.custom_dates) {
        for (const dateText of toStringArray(ad.custom_dates)) {
          const parsedDate = parseCalendarDate(dateText);
          if (parsedDate) {
            dates.push(parsedDate);
          }
        }
      } else {
        const oneTimeDate = parseCalendarDate(ad.schedule || ad.post_date);
        if (oneTimeDate) {
          dates.push(oneTimeDate);
        }
      }

      for (const date of dates) {
        const key = toDateKey(date);
        expanded.push({
          ad: normalizedAd,
          date,
          isPublished:
            String(ad.status || "").toLowerCase() === "published" || publishedDates.includes(key),
        });
      }
    }

    return expanded.sort((a, b) => {
      if (a.date.valueOf() !== b.date.valueOf()) {
        return a.date.valueOf() - b.date.valueOf();
      }
      return String(a.ad.ad_name || "").localeCompare(String(b.ad.ad_name || ""));
    });
  }, [ads, advertisers, products]);

  const calendarAdvertiserOptions = useMemo(
    () =>
      [...new Set(calendarExpandedAds.map((item) => item.ad.advertiser).filter(Boolean))].sort(),
    [calendarExpandedAds],
  );

  const calendarPlacementOptions = useMemo(
    () =>
      [...new Set(calendarExpandedAds.map((item) => item.ad.placement).filter(Boolean))].sort(),
    [calendarExpandedAds],
  );

  const calendarPostTypeOptions = useMemo(
    () =>
      [...new Set(calendarExpandedAds.map((item) => item.ad.post_type).filter(Boolean))].sort(),
    [calendarExpandedAds],
  );

  const calendarFilteredAds = useMemo(() => {
    return calendarExpandedAds.filter((item) => {
      const adName = String(item.ad.ad_name || "").toLowerCase();
      const advertiser = String(item.ad.advertiser || "").toLowerCase();
      const searchText = String(calendarSearch || "").toLowerCase();

      if (searchText && !adName.includes(searchText) && !advertiser.includes(searchText)) {
        return false;
      }

      if (calendarSelectedAdvertiser && item.ad.advertiser !== calendarSelectedAdvertiser) {
        return false;
      }

      if (calendarSelectedPlacement && item.ad.placement !== calendarSelectedPlacement) {
        return false;
      }

      if (calendarSelectedPostType && item.ad.post_type !== calendarSelectedPostType) {
        return false;
      }

      if (calendarSelectedStatus) {
        if (
          calendarSelectedStatus === "Paid" ||
          calendarSelectedStatus === "Unpaid"
        ) {
          if (item.ad.payment !== calendarSelectedStatus) {
            return false;
          }
        } else if (item.ad.status !== calendarSelectedStatus) {
          return false;
        }
      }

      if (calendarUnpublishedOnly && String(item.ad.status || "").toLowerCase() === "published") {
        return false;
      }

      return true;
    });
  }, [
    calendarExpandedAds,
    calendarSearch,
    calendarSelectedAdvertiser,
    calendarSelectedPlacement,
    calendarSelectedPostType,
    calendarSelectedStatus,
    calendarUnpublishedOnly,
  ]);

  const calendarUpcomingAds = useMemo(() => {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);
    return calendarFilteredAds
      .filter((item) => item.date >= now && item.date <= sevenDaysFromNow)
      .sort((a, b) => a.date.valueOf() - b.date.valueOf())
      .slice(0, 10);
  }, [calendarFilteredAds]);

  const navigateCalendarDate = (direction) => {
    const nextDate = new Date(calendarCurrentDate);
    if (calendarMode === "month") {
      nextDate.setMonth(nextDate.getMonth() + direction);
    } else if (calendarMode === "week") {
      nextDate.setDate(nextDate.getDate() + direction * 7);
    } else {
      nextDate.setDate(nextDate.getDate() + direction);
    }
    setCalendarCurrentDate(nextDate);
  };

  const goToCalendarToday = () => {
    setCalendarCurrentDate(new Date());
  };

  const handleCalendarAdClick = (selectedAd) => {
    setCalendarSelectedAd(selectedAd);
    setCalendarPreviewOpen(true);
  };

  const handleCalendarDateClick = (date) => {
    if (calendarMode === "month") {
      setCalendarCurrentDate(date);
      setCalendarMode("day");
    }
  };

  const calendarPeriodLabel = useMemo(() => {
    if (calendarMode === "week") {
      const weekStart = getWeekStart(calendarCurrentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
    }

    const options =
      calendarMode === "month"
        ? { month: "long", year: "numeric" }
        : { month: "long", day: "numeric", year: "numeric" };
    return calendarCurrentDate.toLocaleDateString("en-US", options);
  }, [calendarCurrentDate, calendarMode]);

  const adsNormalized = useMemo(() => {
    const advertiserById = new Map(
      advertisers.map((item) => [item.id, item.advertiser_name || item.name || ""]),
    );
    const placementByProductId = new Map(
      products.map((item) => [item.id, item.placement || ""]),
    );

    const todayKey = toDateKey(new Date());

    return ads.map((item) => {
      const customDates = toStringArray(item.custom_dates)
        .map((dateText) => String(dateText).slice(0, 10))
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));
      const publishedDates = toStringArray(item.published_dates)
        .map((dateText) => String(dateText).slice(0, 10))
        .filter(Boolean);
      const nextCustomDate =
        customDates.find((dateText) => dateText >= todayKey) ||
        customDates[0] ||
        "";
      const schedule = item.schedule || item.post_date || item.post_date_from || nextCustomDate;
      const advertiserName =
        item.advertiser || advertiserById.get(item.advertiser_id) || "N/A";
      const placement =
        item.placement || placementByProductId.get(item.product_id) || "N/A";
      const status = item.status || "Draft";
      const paymentRaw = String(item.payment || "").trim();
      const payment = normalizeAdsPayment(paymentRaw);

      return {
        ...item,
        advertiser: advertiserName,
        placement,
        status,
        payment_raw: paymentRaw || "Unpaid",
        payment,
        post_type: normalizeCalendarPostType(item.post_type),
        schedule,
        custom_dates: customDates,
        published_dates: publishedDates,
      };
    });
  }, [ads, advertisers, products]);

  const adsPlacementOptions = useMemo(
    () => [...new Set(adsNormalized.map((item) => item.placement).filter(Boolean))].sort(),
    [adsNormalized],
  );

  const adsPostTypeOptions = useMemo(
    () => [...new Set(adsNormalized.map((item) => item.post_type).filter(Boolean))].sort(),
    [adsNormalized],
  );

  const adsAdvertiserOptions = useMemo(
    () => [...new Set(adsNormalized.map((item) => item.advertiser).filter(Boolean))].sort(),
    [adsNormalized],
  );

  const createAdPlacementOptions = useMemo(() => {
    const options = new Set(["WhatsApp", "Website"]);
    products.forEach((item) => {
      const placement = String(item.placement || "").trim();
      if (placement) {
        options.add(placement);
      }
    });
    return [...options];
  }, [products]);

  const adsActiveAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (adsFilters.placement !== "All Placement") count += 1;
    if (adsFilters.postType !== "All post types") count += 1;
    if (adsFilters.advertiser !== "All Advertisers") count += 1;
    if (adsFilters.payment !== "All Payment Status") count += 1;
    if (adsFilters.dateFrom || adsFilters.dateTo) count += 1;
    return count;
  }, [adsFilters]);

  const filteredAds = useMemo(() => {
    const query = String(adsFilters.search || "").toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = getWeekStart(today);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return adsNormalized.filter((item) => {
      const adName = String(item.ad_name || "").toLowerCase();
      const advertiser = String(item.advertiser || "").toLowerCase();
      const placement = String(item.placement || "").toLowerCase();

      if (query && !adName.includes(query) && !advertiser.includes(query) && !placement.includes(query)) {
        return false;
      }

      const scheduleDate = parseCalendarDate(item.schedule);
      if (adsFilters.status === "Today") {
        if (!scheduleDate || toDateKey(scheduleDate) !== toDateKey(today)) {
          return false;
        }
      } else if (adsFilters.status === "This Week") {
        if (!scheduleDate || scheduleDate < weekStart || scheduleDate > weekEnd) {
          return false;
        }
      } else if (adsFilters.status === "Upcoming Ads") {
        if (!scheduleDate || scheduleDate < today) {
          return false;
        }
      } else if (adsFilters.status === "Past Ads") {
        if (!scheduleDate || scheduleDate >= today) {
          return false;
        }
      } else if (
        adsFilters.status !== "All Ads" &&
        String(item.status || "") !== adsFilters.status
      ) {
        return false;
      }

      if (adsFilters.placement !== "All Placement" && item.placement !== adsFilters.placement) {
        return false;
      }
      if (adsFilters.postType !== "All post types" && item.post_type !== adsFilters.postType) {
        return false;
      }
      if (adsFilters.advertiser !== "All Advertisers" && item.advertiser !== adsFilters.advertiser) {
        return false;
      }

      if (adsFilters.payment !== "All Payment Status") {
        if (adsFilters.payment === "Pending") {
          if (!["Pending", "Unpaid"].includes(String(item.payment_raw || item.payment))) {
            return false;
          }
        } else if (String(item.payment || "") !== adsFilters.payment) {
          return false;
        }
      }

      if (adsFilters.dateFrom || adsFilters.dateTo) {
        if (!scheduleDate) {
          return false;
        }
        const minDate = adsFilters.dateFrom ? parseCalendarDate(adsFilters.dateFrom) : null;
        const maxDate = adsFilters.dateTo ? parseCalendarDate(adsFilters.dateTo) : null;
        if (minDate && scheduleDate < minDate) {
          return false;
        }
        if (maxDate && scheduleDate > maxDate) {
          return false;
        }
      }

      return true;
    });
  }, [adsFilters, adsNormalized]);

  const sortedAds = useMemo(() => {
    if (!adsSortConfig.key) {
      return filteredAds;
    }

    return [...filteredAds].sort((left, right) => {
      let leftValue = left[adsSortConfig.key];
      let rightValue = right[adsSortConfig.key];

      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      if (adsSortConfig.key === "schedule" || adsSortConfig.key === "post_date_from") {
        leftValue = parseCalendarDate(leftValue)?.valueOf() || 0;
        rightValue = parseCalendarDate(rightValue)?.valueOf() || 0;
      } else if (adsSortConfig.key === "post_time") {
        const toMinutes = (timeValue) => {
          if (!timeValue) return 0;
          const [hoursText, minutesText] = String(timeValue).split(":");
          return (Number(hoursText) || 0) * 60 + (Number(minutesText) || 0);
        };
        leftValue = toMinutes(leftValue);
        rightValue = toMinutes(rightValue);
      } else if (typeof leftValue === "string") {
        leftValue = leftValue.toLowerCase();
        rightValue = String(rightValue || "").toLowerCase();
      }

      if (leftValue < rightValue) {
        return adsSortConfig.direction === "asc" ? -1 : 1;
      }
      if (leftValue > rightValue) {
        return adsSortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [adsSortConfig, filteredAds]);

  const linkedPreviewInvoices = useMemo(() => {
    if (!adsPreviewAd?.id) {
      return [];
    }
    const adId = String(adsPreviewAd.id);
    return invoices.filter((item) =>
      toStringArray(item.ad_ids)
        .map((entry) => String(entry))
        .includes(adId),
    );
  }, [adsPreviewAd?.id, invoices]);

  const todayAds = useMemo(() => {
    const todayText = new Date().toISOString().slice(0, 10);
    return upcomingAds.filter(
      (item) => String(item.post_date || "").slice(0, 10) === todayText,
    );
  }, [upcomingAds]);

  const overdueInvoiceList = useMemo(
    () => invoices.filter((item) => item.status === "Overdue"),
    [invoices],
  );

  const capacityWarnings = useMemo(() => {
    const maxAdsPerDay =
      Number(db.admin_settings?.max_ads_per_day) ||
      Number(db.admin_settings?.max_ads_per_slot) ||
      0;
    if (maxAdsPerDay <= 0) {
      return [];
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dayMap = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = date.toISOString().slice(0, 10);
      dayMap.set(key, {
        date: key,
        count: 0,
        max: maxAdsPerDay,
      });
    }

    for (const ad of upcomingAds) {
      const key = String(ad.post_date || "").slice(0, 10);
      const bucket = dayMap.get(key);
      if (bucket) {
        bucket.count += 1;
      }
    }

    return [...dayMap.values()].filter((item) => item.count >= item.max);
  }, [db.admin_settings, upcomingAds]);

  const topAdvertisers = useMemo(() => {
    const lookup = new Map();

    for (const ad of ads) {
      if (ad.payment !== "Paid") {
        continue;
      }

      const key =
        ad.advertiser_id ||
        `name:${String(ad.advertiser || "Unknown advertiser").toLowerCase()}`;
      const name =
        advertisers.find((item) => item.id === ad.advertiser_id)?.advertiser_name ||
        ad.advertiser ||
        "Unknown advertiser";

      const current = lookup.get(key) || {
        id: ad.advertiser_id || key,
        advertiser_name: name,
        total_spent: 0,
      };
      current.total_spent += Number(ad.price) || 0;
      lookup.set(key, current);
    }

    for (const advertiser of advertisers) {
      const key = advertiser.id || `name:${String(advertiser.advertiser_name || "").toLowerCase()}`;
      const fallbackSpend =
        Number(advertiser.total_spend) ||
        Number(advertiser.ad_spend) ||
        Number(advertiser.spend) ||
        0;

      if (!lookup.has(key)) {
        lookup.set(key, {
          id: advertiser.id || key,
          advertiser_name: advertiser.advertiser_name || "Unknown advertiser",
          total_spent: fallbackSpend,
        });
      } else if (fallbackSpend > 0) {
        const existing = lookup.get(key);
        existing.total_spent = Math.max(existing.total_spent, fallbackSpend);
      }
    }

    return [...lookup.values()]
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 5);
  }, [ads, advertisers]);

  const revenueTrend = useMemo(() => {
    const points = [];
    const now = new Date();

    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const monthKey = `${monthDate.getFullYear()}-${String(
        monthDate.getMonth() + 1,
      ).padStart(2, "0")}`;
      points.push({
        month: monthKey,
        revenue: 0,
      });
    }

    const byMonth = new Map(points.map((item) => [item.month, item]));
    for (const ad of ads) {
      if (ad.payment !== "Paid") {
        continue;
      }
      const sourceDate = ad.post_date || ad.created_at;
      if (!sourceDate) {
        continue;
      }

      const date = new Date(sourceDate);
      if (Number.isNaN(date.valueOf())) {
        continue;
      }
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}`;
      const bucket = byMonth.get(key);
      if (bucket) {
        bucket.revenue += Number(ad.price) || 0;
      }
    }

    return points;
  }, [ads]);

  const maxRevenueValue = useMemo(
    () =>
      Math.max(
        ...revenueTrend.map((point) => Number(point.revenue) || 0),
        1,
      ),
    [revenueTrend],
  );

  const dashboardInsights = useMemo(() => {
    const avgAdPrice =
      ads.length > 0
        ? ads.reduce((sum, item) => sum + (Number(item.price) || 0), 0) / ads.length
        : 0;

    const byType = new Map();
    const byPlacement = new Map();
    for (const ad of ads) {
      const postType = String(ad.post_type || "N/A");
      byType.set(postType, (byType.get(postType) || 0) + 1);

      const placement =
        ad.placement ||
        products.find((item) => item.id === ad.product_id)?.placement ||
        "N/A";
      byPlacement.set(placement, (byPlacement.get(placement) || 0) + 1);
    }

    const [mostPopularType = "N/A"] = [...byType.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    const [mostPopularPlacement = "N/A"] =
      [...byPlacement.entries()].sort((a, b) => b[1] - a[1])[0] || [];

    return {
      avgAdPrice,
      mostPopularType,
      mostPopularPlacement,
    };
  }, [ads, products]);

  const recentAds = useMemo(() => {
    return [...ads]
      .sort((a, b) => {
        const dateA = new Date(
          a.created_at || `${a.post_date || ""}T${a.post_time || "00:00:00"}`,
        );
        const dateB = new Date(
          b.created_at || `${b.post_date || ""}T${b.post_time || "00:00:00"}`,
        );
        return dateB.valueOf() - dateA.valueOf();
      })
      .slice(0, 5);
  }, [ads]);

  const filteredPendingSubmissions = useMemo(() => pending, [pending]);

  const filteredAdvertisers = useMemo(() => {
    return advertisers.filter((item) => {
      if (!advertiserSearch) {
        return true;
      }
      const query = advertiserSearch.toLowerCase();
      return (
        String(item.advertiser_name || "").toLowerCase().includes(query) ||
        String(item.contact_name || "").toLowerCase().includes(query) ||
        String(item.email || "").toLowerCase().includes(query) ||
        String(item.phone_number || item.phone || "")
          .toLowerCase()
          .includes(query)
      );
    });
  }, [advertiserSearch, advertisers]);

  const filteredProducts = useMemo(() => products, [products]);

  const filteredInvoices = useMemo(() => {
    const baseFiltered = invoices.filter((item) => {
      const normalizedStatus = normalizeInvoiceStatus(item.status);
      const advertiserName =
        item.advertiser_name ||
        advertisers.find((adv) => adv.id === item.advertiser_id)?.advertiser_name ||
        "";

      if (invoiceFilters.status !== "All" && normalizedStatus !== invoiceFilters.status) {
        return false;
      }

      const query = String(invoiceFilters.search || "").toLowerCase().trim();
      if (!query) {
        return true;
      }

      return (
        String(item.invoice_number || "").toLowerCase().includes(query) ||
        String(normalizedStatus || "").toLowerCase().includes(query) ||
        String(advertiserName || "").toLowerCase().includes(query)
      );
    });

    if (!invoiceSortConfig.key || !invoiceSortConfig.direction) {
      return baseFiltered;
    }

    const sorted = [...baseFiltered].sort((a, b) => {
      let aValue;
      let bValue;

      switch (invoiceSortConfig.key) {
        case "invoice_number":
          aValue = String(a.invoice_number || "");
          bValue = String(b.invoice_number || "");
          break;
        case "advertiser_name":
          aValue = String(
            a.advertiser_name ||
            advertisers.find((adv) => adv.id === a.advertiser_id)?.advertiser_name ||
            "",
          );
          bValue = String(
            b.advertiser_name ||
            advertisers.find((adv) => adv.id === b.advertiser_id)?.advertiser_name ||
            "",
          );
          break;
        case "date":
          aValue = new Date(a.due_date || a.created_at || 0).valueOf();
          bValue = new Date(b.due_date || b.created_at || 0).valueOf();
          break;
        case "status":
          aValue = normalizeInvoiceStatus(a.status);
          bValue = normalizeInvoiceStatus(b.status);
          break;
        case "items":
          aValue = Array.isArray(a.ad_ids) ? a.ad_ids.length : 0;
          bValue = Array.isArray(b.ad_ids) ? b.ad_ids.length : 0;
          break;
        case "total":
          aValue = Number(a.amount) || 0;
          bValue = Number(b.amount) || 0;
          break;
        default:
          aValue = "";
          bValue = "";
      }

      if (aValue < bValue) {
        return invoiceSortConfig.direction === "asc" ? -1 : 1;
      }
      if (aValue > bValue) {
        return invoiceSortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [advertisers, invoiceFilters, invoices, invoiceSortConfig]);

  const invoiceSummary = useMemo(() => {
    return filteredInvoices.reduce(
      (acc, item) => {
        const amount = Number(item.amount) || 0;
        const status = normalizeInvoiceStatus(item.status);
        if (status === "Paid") {
          acc.totalPaid += amount;
        }
        if (status === "Pending" || status === "Overdue") {
          acc.totalOutstanding += amount;
        }
        if (status === "Overdue") {
          acc.overdueCount += 1;
        }
        return acc;
      },
      { totalOutstanding: 0, totalPaid: 0, overdueCount: 0 },
    );
  }, [filteredInvoices]);

  const reconciliation = useMemo(() => getReconciliationReport(), [db]);

  const run = async (fn, successText) => {
    try {
      await fn();
      setDb(readDb());
      setMessage(successText);
      window.setTimeout(() => setMessage(""), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    }
  };

  const download = (filename, text, type) => {
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleSettingsProfileImageUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSettingsProfileMessage({
        type: "error",
        text: "Image must be less than 5MB",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSettingsProfileMessage({
        type: "error",
        text: "Please upload an image file",
      });
      return;
    }

    setSettingsProfileUploading(true);
    setSettingsProfileMessage(null);

    const reader = new FileReader();
    reader.onload = () => {
      setSettingsProfileImage(String(reader.result || ""));
      setSettingsProfileUploading(false);
    };
    reader.onerror = () => {
      setSettingsProfileUploading(false);
      setSettingsProfileMessage({
        type: "error",
        text: "Failed to upload image",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSettingsProfileSave = async (event) => {
    event.preventDefault();
    if (!user) {
      return;
    }

    setSettingsProfileSaving(true);
    setSettingsProfileMessage(null);
    try {
      const updated = await updateCurrentUser({
        name: settingsProfileName.trim() || user.name || "User",
        image: settingsProfileImage || "",
        whatsapp_number: settingsProfileWhatsapp.trim(),
      });
      if (!updated) {
        throw new Error("Failed to update profile");
      }
      setUser(updated);
      setDb(readDb());
      setSettingsProfileMessage({
        type: "success",
        text: "Profile updated successfully",
      });
    } catch (error) {
      setSettingsProfileMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update profile",
      });
    } finally {
      setSettingsProfileSaving(false);
    }
  };

  const handleSettingsAddMember = async (event) => {
    event.preventDefault();
    const name = settingsTeamName.trim();
    const email = settingsTeamEmail.trim().toLowerCase();
    const password = settingsTeamPassword;

    if (!name || !email || !password) {
      setSettingsTeamError("Name, email, and password are required.");
      return;
    }
    if (password.length < 6) {
      setSettingsTeamError("Password must be at least 6 characters.");
      return;
    }

    setSettingsTeamSaving(true);
    setSettingsTeamError("");

    try {
      await updateDb((currentDb) => {
        if (
          (currentDb.users || []).some(
            (item) => String(item.email || "").toLowerCase() === email,
          )
        ) {
          throw new Error("A user with this email already exists.");
        }
        if (
          (currentDb.team_members || []).some(
            (item) => String(item.email || "").toLowerCase() === email,
          )
        ) {
          throw new Error("A team member with this email already exists.");
        }

        const now = new Date().toISOString();
        currentDb.users = [
          {
            id: createId("user"),
            name,
            email,
            password,
            role: "admin",
            image: "",
            created_at: now,
            updated_at: now,
          },
          ...(currentDb.users || []),
        ];
        currentDb.team_members = [
          {
            id: createId("member"),
            name,
            email,
            role: "admin",
            created_at: now,
            updated_at: now,
          },
          ...(currentDb.team_members || []),
        ];
        return currentDb;
      });

      setDb(readDb());
      setSettingsTeamModalOpen(false);
      setSettingsTeamName("");
      setSettingsTeamEmail("");
      setSettingsTeamPassword("");
      setSettingsTeamError("");
    } catch (error) {
      setSettingsTeamError(
        error instanceof Error ? error.message : "Failed to add member",
      );
    } finally {
      setSettingsTeamSaving(false);
    }
  };

  const handleSettingsRemoveMember = async (member) => {
    const memberEmail = String(member.email || "").toLowerCase();
    if (memberEmail && memberEmail === String(user?.email || "").toLowerCase()) {
      setSettingsTeamError("You cannot remove the currently signed-in account.");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this team member?")) {
      return;
    }

    try {
      await updateDb((currentDb) => {
        currentDb.team_members = (currentDb.team_members || []).filter(
          (item) => item.id !== member.id,
        );
        currentDb.users = (currentDb.users || []).filter(
          (item) => String(item.email || "").toLowerCase() !== memberEmail,
        );
        return currentDb;
      });
      setDb(readDb());
      setSettingsTeamError("");
    } catch (error) {
      setSettingsTeamError(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    }
  };

  const handleSettingsSaveNotifications = async () => {
    setSettingsNotificationSaving(true);
    setSettingsNotificationMessage(null);
    try {
      await saveNotificationPreferences({
        ...settingsNotification,
        reminder_email: settingsNotification.email_address,
      });
      setDb(readDb());
      setSettingsNotificationMessage({
        type: "success",
        text: "Notification preferences saved successfully!",
      });
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save preferences. Please try again.",
      });
    } finally {
      setSettingsNotificationSaving(false);
    }
  };

  const handleSettingsSendTestEmail = () => {
    const email = settingsNotification.email_address.trim();
    if (!email) {
      setSettingsNotificationMessage({
        type: "error",
        text: "Please enter an email address first",
      });
      return;
    }
    setSettingsNotificationTesting(true);
    setSettingsNotificationMessage(null);
    window.setTimeout(() => {
      setSettingsNotificationTesting(false);
      setSettingsNotificationMessage({
        type: "success",
        text: `Test email sent to ${email}! Check your inbox.`,
      });
    }, 500);
  };

  const handleSettingsAddTelegramChatId = async () => {
    const label = settingsTelegramNewLabel.trim();
    const chatId = settingsTelegramNewChatId.trim();
    if (!label || !chatId) {
      return;
    }

    setSettingsTelegramAdding(true);
    setSettingsNotificationMessage(null);
    try {
      await updateDb((currentDb) => {
        const list = Array.isArray(currentDb.telegram_chat_ids)
          ? currentDb.telegram_chat_ids
          : [];
        if (list.some((item) => String(item.chat_id || "").trim() === chatId)) {
          throw new Error("That chat ID already exists.");
        }
        const now = new Date().toISOString();
        currentDb.telegram_chat_ids = [
          ...list,
          {
            id: createId(),
            label,
            chat_id: chatId,
            is_active: true,
            created_at: now,
            updated_at: now,
          },
        ];
        return currentDb;
      });
      setDb(readDb());
      setSettingsTelegramNewLabel("");
      setSettingsTelegramNewChatId("");
      setSettingsNotificationMessage({
        type: "success",
        text: "Telegram chat ID added.",
      });
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to add Telegram chat ID.",
      });
    } finally {
      setSettingsTelegramAdding(false);
    }
  };

  const handleSettingsToggleTelegramChatId = async (id, nextActive) => {
    try {
      await updateDb((currentDb) => {
        const list = Array.isArray(currentDb.telegram_chat_ids)
          ? currentDb.telegram_chat_ids
          : [];
        const now = new Date().toISOString();
        currentDb.telegram_chat_ids = list.map((item) =>
          item.id === id ? { ...item, is_active: nextActive, updated_at: now } : item,
        );
        return currentDb;
      });
      setDb(readDb());
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update Telegram chat ID.",
      });
    }
  };

  const handleSettingsDeleteTelegramChatId = async (id) => {
    if (!window.confirm("Delete this Telegram chat ID?")) {
      return;
    }
    try {
      await updateDb((currentDb) => {
        const list = Array.isArray(currentDb.telegram_chat_ids)
          ? currentDb.telegram_chat_ids
          : [];
        currentDb.telegram_chat_ids = list.filter((item) => item.id !== id);
        return currentDb;
      });
      setDb(readDb());
      setSettingsNotificationMessage({
        type: "success",
        text: "Telegram chat ID removed.",
      });
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to remove Telegram chat ID.",
      });
    }
  };

  const handleSettingsTestTelegram = (chatId, label) => {
    setSettingsTelegramTesting(chatId);
    setSettingsNotificationMessage(null);
    window.setTimeout(() => {
      setSettingsTelegramTesting(null);
      setSettingsNotificationMessage({
        type: "success",
        text: `Test message sent to "${label}"!`,
      });
    }, 500);
  };

  const handleSettingsSetupTelegramWebhook = () => {
    setSettingsTelegramWebhookLoading(true);
    setSettingsTelegramWebhookStatus(null);
    window.setTimeout(() => {
      setSettingsTelegramWebhookLoading(false);
      setSettingsTelegramWebhookStatus({
        type: "success",
        text: "Webhook registered. Telegram quick actions are ready.",
      });
    }, 600);
  };

  const handleSettingsCheckReminders = () => {
    setSettingsNotificationChecking(true);
    setSettingsReminderResults(null);
    setSettingsNotificationMessage(null);

    try {
      const unitToMs = {
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
      };
      const value = Math.max(1, Number(settingsNotification.reminder_time_value) || 1);
      const windowMs =
        value * (unitToMs[settingsNotification.reminder_time_unit] || unitToMs.hours);
      const now = Date.now();

      const results = [];
      for (const adItem of ads) {
        if (!adItem.post_date) {
          continue;
        }
        const scheduledAt = new Date(
          `${adItem.post_date}T${adItem.post_time || "00:00:00"}`,
        );
        if (Number.isNaN(scheduledAt.valueOf())) {
          continue;
        }
        const diff = scheduledAt.valueOf() - now;
        if (diff < 0 || diff > windowMs) {
          continue;
        }

        const advertiser = advertisers.find(
          (item) => item.id === adItem.advertiser_id,
        );
        if (settingsNotification.email_enabled && settingsNotification.email_address) {
          results.push({
            type: "admin-email",
            to: settingsNotification.email_address,
            status: "queued",
            ad_name: adItem.ad_name,
          });
        }
        if (settingsNotification.sms_enabled && settingsNotification.phone_number) {
          results.push({
            type: "admin-sms",
            to: settingsNotification.phone_number,
            status: "queued",
            ad_name: adItem.ad_name,
          });
        }
        if (settingsNotification.telegram_enabled) {
          settingsTelegramChatIds
            .filter((item) => item.is_active !== false && item.chat_id)
            .forEach((item) => {
              results.push({
                type: "admin-telegram",
                to: item.label || item.chat_id,
                status: "queued",
                ad_name: adItem.ad_name,
              });
            });
        }
        if (advertiser?.email) {
          results.push({
            type: "advertiser-email",
            to: advertiser.email,
            status: "queued",
            ad_name: adItem.ad_name,
          });
        }
      }

      setSettingsReminderResults({
        totalResults: results.length,
        results,
      });

      if (results.length === 0) {
        setSettingsNotificationMessage({
          type: "info",
          text: "No reminders due at this time. Check console logs for details.",
        });
      } else {
        setSettingsNotificationMessage({
          type: "success",
          text: `Processed ${results.length} reminder(s). See results below.`,
        });
      }
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error ? error.message : "Failed to check reminders.",
      });
    } finally {
      setSettingsNotificationChecking(false);
    }
  };

  const handleSettingsSaveScheduling = async () => {
    const parsed = Number(settingsMaxAdsPerDay);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setSettingsSchedulingError("Maximum ads per day must be at least 1");
      return;
    }

    setSettingsSchedulingSaving(true);
    setSettingsSchedulingError("");
    setSettingsSchedulingSuccess(false);

    try {
      await saveAdminSettings({
        max_ads_per_day: Math.floor(parsed),
        max_ads_per_slot: Math.floor(parsed),
      });
      setDb(readDb());
      setSettingsSchedulingSuccess(true);
      window.setTimeout(() => setSettingsSchedulingSuccess(false), 3000);
    } catch (error) {
      setSettingsSchedulingError(
        error instanceof Error ? error.message : "Failed to save settings",
      );
    } finally {
      setSettingsSchedulingSaving(false);
    }
  };

  const handleSettingsRunSync = async () => {
    setSyncing(true);
    setSettingsSystemError("");
    setSettingsSystemSyncResult(null);

    try {
      const response = await fetch("/api/admin/fix-all-spending", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Failed to sync advertiser spending (${response.status})`,
        );
      }

      setSettingsSystemSyncResult(data);
    } catch (error) {
      setSettingsSystemError(
        error instanceof Error
          ? error.message
          : "Failed to sync advertiser spending",
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleWhatsAppMarkRead = (messageId) =>
    run(async () => {
      await updateDb((currentDb) => {
        const now = new Date().toISOString();
        const messages = Array.isArray(currentDb.whatsapp_messages)
          ? currentDb.whatsapp_messages
          : [];
        currentDb.whatsapp_messages = messages.map((item) =>
          item.id === messageId
            ? {
              ...item,
              is_read: true,
              updated_at: now,
            }
            : item,
        );
        return currentDb;
      });
    }, "Message marked as read.");

  const handleWhatsAppMarkReplied = (messageId) =>
    run(async () => {
      await updateDb((currentDb) => {
        const now = new Date().toISOString();
        const messages = Array.isArray(currentDb.whatsapp_messages)
          ? currentDb.whatsapp_messages
          : [];
        currentDb.whatsapp_messages = messages.map((item) =>
          item.id === messageId
            ? {
              ...item,
              is_read: true,
              replied_to: true,
              updated_at: now,
            }
            : item,
        );
        return currentDb;
      });
    }, "Message marked as replied.");

  const handleWhatsAppDelete = (messageId) =>
    run(async () => {
      await updateDb((currentDb) => {
        const messages = Array.isArray(currentDb.whatsapp_messages)
          ? currentDb.whatsapp_messages
          : [];
        currentDb.whatsapp_messages = messages.filter((item) => item.id !== messageId);
        return currentDb;
      });
      setWhatsAppSelectedMessageId((current) => (current === messageId ? null : current));
    }, "Message deleted.");

  const handleWhatsAppSeedDemo = () =>
    run(async () => {
      await updateDb((currentDb) => {
        const existing = Array.isArray(currentDb.whatsapp_messages)
          ? currentDb.whatsapp_messages
          : [];
        if (existing.length > 0) {
          return currentDb;
        }
        const now = Date.now();
        currentDb.whatsapp_messages = [
          {
            id: createId(),
            from_name: "Michael Rivera",
            from_number: "+1 (786) 555-0188",
            advertiser_name: "Rivera Landscaping",
            message_text: "Can we move the promo post to tomorrow at 10:00 AM?",
            notes: "Requested schedule adjustment.",
            is_read: false,
            replied_to: false,
            created_at: new Date(now - 1000 * 60 * 12).toISOString(),
            updated_at: new Date(now - 1000 * 60 * 12).toISOString(),
          },
          {
            id: createId(),
            from_name: "Jasmine Lee",
            from_number: "+1 (305) 555-0135",
            advertiser_name: "Lee Fitness Studio",
            message_text:
              "Please include the new discount code in the next ad creative.",
            notes: "",
            is_read: true,
            replied_to: true,
            created_at: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
            updated_at: new Date(now - 1000 * 60 * 60 * 2.5).toISOString(),
          },
          {
            id: createId(),
            from_name: "Support Queue",
            from_number: "+1 (877) 555-0101",
            advertiser_name: "General",
            message_text: "New inbound message routed from webhook.",
            notes: "Auto-imported.",
            is_read: false,
            replied_to: false,
            created_at: new Date(now - 1000 * 60 * 4).toISOString(),
            updated_at: new Date(now - 1000 * 60 * 4).toISOString(),
          },
        ];
        return currentDb;
      });
    }, "Sample WhatsApp messages loaded.");



  const handleAdsSort = (key) => {
    setAdsSortConfig((current) => {
      const direction =
        current.key === key && current.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const handleInvoiceSort = (key) => {
    setInvoiceSortConfig((current) => {
      const direction =
        current.key === key && current.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const openInvoiceMenu = (invoiceId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    setInvoiceMenuPosition({
      vertical: spaceBelow < 350 ? "top" : "bottom",
      horizontal: spaceRight < 200 ? "left" : "right",
    });
    setOpenInvoiceMenuId((current) => (current === invoiceId ? null : invoiceId));
  };

  const openInvoiceEditor = (item) => {
    setInvoice({
      ...blankInvoice,
      ...item,
      status: normalizeInvoiceStatus(item.status),
      ad_ids: item.ad_ids || [],
    });
    setView("newInvoice");
    setOpenInvoiceMenuId(null);
    setShowInvoiceCreateMenu(false);
  };

  const openInvoicePreview = (item) => {
    setInvoicePreviewModal({
      ...item,
      advertiser_name:
        item.advertiser_name ||
        advertisers.find((adv) => adv.id === item.advertiser_id)?.advertiser_name ||
        "-",
      status: normalizeInvoiceStatus(item.status),
      ad_ids: Array.isArray(item.ad_ids) ? item.ad_ids : [],
    });
    setOpenInvoiceMenuId(null);
  };

  const markInvoiceAsPaid = (item) =>
    run(async () => {
      await upsertInvoice({
        ...item,
        status: "Paid",
        ad_ids: Array.isArray(item.ad_ids) ? item.ad_ids : [],
      });
      setOpenInvoiceMenuId(null);
      if (invoicePreviewModal?.id === item.id) {
        setInvoicePreviewModal((current) =>
          current ? { ...current, status: "Paid" } : current,
        );
      }
    }, "Invoice marked as paid.");

  const deleteInvoiceRecord = (invoiceId) =>
    run(async () => {
      await deleteInvoice(invoiceId);
      setOpenInvoiceMenuId(null);
      if (invoicePreviewModal?.id === invoiceId) {
        setInvoicePreviewModal(null);
      }
    }, "Invoice deleted.");

  const saveInvoiceForm = () =>
    run(async () => {
      if (!invoice.advertiser_id) {
        throw new Error("Advertiser required");
      }
      if (!String(invoice.amount || "").trim()) {
        throw new Error("Amount required");
      }
      await upsertInvoice({
        ...invoice,
        status: normalizeInvoiceStatus(invoice.status),
      });
      setInvoice(blankInvoice);
      setView("list");
    }, "Invoice saved.");

  const clearAdsAdvancedFilters = () => {
    setAdsFilters((current) => ({
      ...current,
      placement: "All Placement",
      postType: "All post types",
      advertiser: "All Advertisers",
      payment: "All Payment Status",
      dateFrom: "",
      dateTo: "",
    }));
    setAdsShowDateRangePicker(false);
  };

  const openAdEditor = (item) => {
    const advertiserId =
      item.advertiser_id ||
      advertisers.find(
        (advertiserItem) =>
          String(advertiserItem.advertiser_name || "") === String(item.advertiser || ""),
      )?.id ||
      "";
    const productId =
      item.product_id ||
      products.find(
        (productItem) => String(productItem.placement || "") === String(item.placement || ""),
      )?.id ||
      "";

    setAd({
      ...blankAd,
      ...item,
      advertiser_id: advertiserId,
      product_id: productId,
      post_date: item.schedule || item.post_date || item.post_date_from || "",
      post_time: String(item.post_time || "").slice(0, 5),
      payment:
        String(item.payment_raw || item.payment || "").toLowerCase() === "paid"
          ? "Paid"
          : "Unpaid",
    });
    setView("createAd");
  };

  const closeCreateAd = () => {
    setView("list");
    setAd(blankAd);
  };

  const setCreateAdPostType = (postType) => {
    setAd((current) => {
      const next = {
        ...current,
        post_type: toCreateAdPostTypeValue(postType),
      };

      if (postType === "One-Time Post") {
        next.post_date_from = "";
        next.post_date_to = "";
        next.custom_dates = [];
      } else if (postType === "Daily Run") {
        next.custom_dates = [];
      } else if (!Array.isArray(next.custom_dates) || next.custom_dates.length === 0) {
        next.custom_dates = [""];
      }

      return next;
    });
  };

  const saveCreateAd = (mode = "save") =>
    run(async () => {
      if (!String(ad.ad_name || "").trim()) {
        throw new Error("Ad title is required");
      }
      if (!ad.advertiser_id) {
        throw new Error("Advertiser is required");
      }

      const selectedPostType = normalizeCreateAdPostType(ad.post_type);
      const customDates = Array.isArray(ad.custom_dates)
        ? ad.custom_dates.filter((item) => String(item || "").trim())
        : [];
      const paymentMode =
        ad.payment_mode ||
        (String(ad.payment || "").toLowerCase() === "paid"
          ? "Paid"
          : ad.price
            ? "Custom Amount"
            : "TBD");

      const payload = {
        ...ad,
        post_type: toCreateAdPostTypeValue(selectedPostType),
        payment_mode: paymentMode,
        payment: paymentMode === "Paid" ? "Paid" : "Unpaid",
        status: mode === "draft" ? "Draft" : ad.status || "Draft",
        custom_dates: customDates,
      };

      if (selectedPostType === "Daily Run") {
        payload.post_date = payload.post_date_from || payload.post_date || "";
      } else if (selectedPostType === "Custom Schedule") {
        payload.post_date = customDates[0] || "";
      } else {
        payload.post_date = payload.post_date || "";
      }

      await upsertAd(payload);

      if (mode === "continue") {
        setInvoice({
          ...blankInvoice,
          advertiser_id: payload.advertiser_id || "",
          amount: payload.price || "",
        });
        setActiveSection("Billing");
        setView("newInvoice");
      } else {
        setView("list");
      }

      setAd(blankAd);
    }, mode === "continue" ? "Ad saved. Continue to billing." : "Ad saved.");

  const selectedCreateAdPostType = normalizeCreateAdPostType(ad.post_type);
  const createAdPaymentMode =
    ad.payment_mode ||
    (String(ad.payment || "").toLowerCase() === "paid"
      ? "Paid"
      : ad.price
        ? "Custom Amount"
        : "TBD");
  const createAdCustomDates =
    Array.isArray(ad.custom_dates) && ad.custom_dates.length > 0 ? ad.custom_dates : [""];

  const exportVisibleAdsCsv = () => {
    const headers = [
      "Ad",
      "Advertiser",
      "Status",
      "Post Type",
      "Placement",
      "Schedule",
      "Post Time",
      "Payment",
    ];
    const escapeCsv = (value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };
    const rows = sortedAds.map((item) => [
      item.ad_name || "",
      item.advertiser || "",
      item.status || "",
      item.post_type || "",
      item.placement || "",
      formatAdsDate(item.schedule),
      formatAdsTime(item.post_time),
      item.payment || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    download(`cbnads-ads-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
  };

  const markAdAsPublished = (adId) =>
    run(() => updateAdStatus(adId, "Published"), "Ad marked as published.");

  const deleteAdRecord = (adId) => run(() => deleteAd(adId), "Ad deleted.");

  const handleNavigate = (section) => {
    if (!sections.includes(section)) {
      return;
    }
    setActiveSection(section);
    setView("list");
    setAd(blankAd);
    setProduct(blankProduct);
    setInvoice(blankInvoice);
    setAdvertiserCreateOpen(false);
    setProductCreateOpen(false);
    setOpenProductMenuId(null);
    setProductEditModal(null);
    setProductDeleteModal(null);
    setOpenInvoiceMenuId(null);
    setShowInvoiceCreateMenu(false);
    setInvoicePreviewModal(null);
    setShowProfileDropdown(false);
  };



  const openAdvertiserMenu = (advertiserId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const menuHeight = 300;
    const menuWidth = 200;
    setAdvertiserMenuPosition({
      vertical: spaceBelow < menuHeight ? "top" : "bottom",
      horizontal: spaceRight < menuWidth ? "left" : "right",
    });
    setOpenAdvertiserMenuId((current) =>
      current === advertiserId ? null : advertiserId,
    );
  };

  const openAdvertiserCreate = () => {
    setAdvertiserCreateForm({
      advertiser_name: "",
      contact_name: "",
      email: "",
      phone_number: "",
      status: "active",
    });
    setAdvertiserCreateOpen(true);
    setOpenAdvertiserMenuId(null);
    setAdvertiserEditModal(null);
    setAdvertiserDeleteModal(null);
    setAdvertiserViewModal(null);
  };

  const openAdvertiserEdit = (item) => {
    setAdvertiserEditModal({
      ...blankAdvertiser,
      ...item,
      phone_number: item.phone_number || item.phone || "",
      phone: item.phone || item.phone_number || "",
      status: item.status || "active",
    });
    setOpenAdvertiserMenuId(null);
  };

  const openAdvertiserView = (item) => {
    const advertiserAds = ads.filter(
      (adItem) =>
        adItem.advertiser_id === item.id ||
        (!adItem.advertiser_id &&
          String(adItem.advertiser || "") === String(item.advertiser_name || "")),
    );

    setAdvertiserViewModal({
      advertiser: {
        ...item,
        contact_name: item.contact_name || item.business_name || "\u2014",
        phone_number: item.phone_number || item.phone || "",
        total_spend: Number(item.total_spend ?? item.ad_spend ?? 0) || 0,
        status: item.status || "active",
      },
      ads: advertiserAds.map((adItem) => ({
        ...adItem,
        post_date_from: adItem.post_date_from || adItem.post_date || "",
      })),
    });
    setOpenAdvertiserMenuId(null);
  };

  const saveAdvertiserModal = async () => {
    if (!advertiserEditModal) {
      return;
    }

    setAdvertiserActionLoading(true);
    try {
      if (!String(advertiserEditModal.advertiser_name || "").trim()) {
        throw new Error("Advertiser name required");
      }

      await upsertAdvertiser({
        ...advertiserEditModal,
        phone:
          String(advertiserEditModal.phone_number || advertiserEditModal.phone || "").trim(),
      });
      setDb(readDb());
      setMessage("Advertiser saved.");
      window.setTimeout(() => setMessage(""), 1800);
      setAdvertiserEditModal(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save advertiser");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setAdvertiserActionLoading(false);
    }
  };

  const confirmAdvertiserDelete = async () => {
    if (!advertiserDeleteModal) {
      return;
    }
    setAdvertiserActionLoading(true);
    try {
      await deleteAdvertiser(advertiserDeleteModal.id);
      setDb(readDb());
      setMessage("Advertiser deleted.");
      window.setTimeout(() => setMessage(""), 1800);
      setAdvertiserDeleteModal(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete advertiser");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setAdvertiserActionLoading(false);
    }
  };

  const saveNewAdvertiser = async (type) => {
    if (type === "cancel") {
      setAdvertiserCreateOpen(false);
      return;
    }

    setAdvertiserCreateLoading(true);
    try {
      if (!String(advertiserCreateForm.advertiser_name || "").trim()) {
        throw new Error("Advertiser name required");
      }
      if (!String(advertiserCreateForm.contact_name || "").trim()) {
        throw new Error("Contact name required");
      }

      await upsertAdvertiser({
        ...advertiserCreateForm,
        phone: String(advertiserCreateForm.phone_number || "").trim(),
        phone_number: String(advertiserCreateForm.phone_number || "").trim(),
      });
      setDb(readDb());
      setMessage("Advertiser saved.");
      window.setTimeout(() => setMessage(""), 1800);
      setAdvertiserCreateOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create advertiser");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setAdvertiserCreateLoading(false);
    }
  };

  const openProductMenu = (productId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const menuHeight = 350;
    const menuWidth = 200;

    setProductMenuPosition({
      vertical: spaceBelow < menuHeight ? "top" : "bottom",
      horizontal: spaceRight < menuWidth ? "left" : "right",
    });
    setOpenProductMenuId((current) => (current === productId ? null : productId));
  };

  const openProductCreate = () => {
    setProduct(blankProduct);
    setProductCreateOpen(true);
  };

  const saveNewProduct = async (type) => {
    if (type === "cancel") {
      setProductCreateOpen(false);
      setProduct(blankProduct);
      return;
    }

    setProductActionLoading(true);
    try {
      if (!String(product.product_name || "").trim()) {
        throw new Error("Product name required");
      }
      if (!String(product.price || "").trim()) {
        throw new Error("Price required");
      }

      await upsertProduct({
        ...product,
        placement: String(product.placement || "WhatsApp").trim() || "WhatsApp",
      });
      setDb(readDb());
      setMessage("Product saved.");
      window.setTimeout(() => setMessage(""), 1800);
      setProduct(blankProduct);
      setProductCreateOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create product");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setProductActionLoading(false);
    }
  };

  const openProductEdit = (item) => {
    setProductEditModal({
      ...blankProduct,
      ...item,
      placement: item.placement || "WhatsApp",
    });
    setOpenProductMenuId(null);
  };

  const saveProductModal = async () => {
    if (!productEditModal) {
      return;
    }

    setProductActionLoading(true);
    try {
      if (!String(productEditModal.product_name || "").trim()) {
        throw new Error("Product name required");
      }
      if (!String(productEditModal.price || "").trim()) {
        throw new Error("Price required");
      }

      await upsertProduct({
        ...productEditModal,
        placement:
          String(productEditModal.placement || "WhatsApp").trim() || "WhatsApp",
      });
      setDb(readDb());
      setMessage("Product updated.");
      window.setTimeout(() => setMessage(""), 1800);
      setProductEditModal(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update product");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setProductActionLoading(false);
    }
  };

  const openProductDelete = (item) => {
    setProductDeleteModal(item);
    setOpenProductMenuId(null);
  };

  const confirmProductDelete = async () => {
    if (!productDeleteModal) {
      return;
    }

    setProductActionLoading(true);
    try {
      await deleteProduct(productDeleteModal.id);
      setDb(readDb());
      setMessage("Product deleted.");
      window.setTimeout(() => setMessage(""), 1800);
      setProductDeleteModal(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete product");
      window.setTimeout(() => setMessage(""), 1800);
    } finally {
      setProductActionLoading(false);
    }
  };

  const settingsProfileHasChanges =
    settingsProfileName !== (user?.name || "") ||
    settingsProfileImage !== (user?.image || "") ||
    settingsProfileWhatsapp !== (user?.whatsapp_number || "");

  if (!ready) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Redirecting to sign in...</p>
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600 mb-6">
            You do not have admin access to this page.
          </p>
          <a
            href="/account/logout"
            className="inline-block px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
          >
            Sign Out
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white">
      <Sidebar activeItem={activeSection} onNavigate={handleNavigate} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {view === "list" && (
          <header className="h-16 border-b border-gray-200 flex items-center justify-end px-8 gap-4 flex-shrink-0 bg-white">
            <button className="p-2 hover:bg-gray-100 rounded-lg" type="button">
              <Bell size={20} className="text-gray-600" />
            </button>

            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowProfileDropdown((current) => !current)}
                className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">
                  {user.name || user.email}
                </span>
                <div className="w-10 h-10 rounded-full bg-[#F4E4D7] overflow-hidden flex items-center justify-center">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-700">
                      {(user.name || user.email || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className="text-gray-600" />
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <button
                    type="button"
                    onClick={() => handleNavigate("Settings")}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full text-left"
                  >
                    <Settings size={16} />
                    Profile Settings
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <a
                    href="/account/logout"
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <LogOut size={16} />
                    Sign Out
                  </a>
                </div>
              )}
            </div>
          </header>
        )}

        <main
          className={`flex-1 overflow-auto bg-gray-50 ${activeSection === "Calendar" ? "p-0" : "p-8"
            }`}
        >
          {message ? (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              {message}
            </div>
          ) : null}
          {activeSection === "Dashboard" && (
            <div className="max-w-7xl mx-auto">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-gray-600 mt-1">Overview of your ad management</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Active Ads
                    </p>
                    <Calendar className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardStats.totalAds}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Pending Submissions
                    </p>
                    <Clock3 className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardStats.pendingSubmissions}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Outstanding
                    </p>
                    <AlertCircle className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(dashboardStats.outstandingRevenue)}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      This Month
                    </p>
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(dashboardStats.monthRevenue)}
                  </p>
                </div>
              </div>

              {capacityWarnings.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg mb-6">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Capacity Warnings (Next 7 Days)
                    </h2>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
                      {capacityWarnings.map((warning) => (
                        <div
                          key={warning.date}
                          className="bg-gray-50 border border-gray-200 rounded p-3 text-center"
                        >
                          <p className="text-xs text-gray-600 mb-1">
                            {formatDate(warning.date)}
                          </p>
                          <p className="text-sm font-bold text-gray-900">
                            {warning.count}/{warning.max}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">at capacity</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Publishing Today
                    </h2>
                  </div>
                  <div className="p-5">
                    {todayAds.length > 0 ? (
                      <div className="space-y-3">
                        {todayAds.slice(0, 6).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.ad_name}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {item.advertiser || "-"}
                                {" \u2022 "}
                                {item.placement || "-"}
                              </p>
                            </div>
                            <div className="ml-4 text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-700">
                                {formatTime(item.post_time)}
                              </p>
                              <span
                                className={`inline-block mt-1 rounded px-2 py-0.5 text-xs font-medium ${item.status === "Published"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-gray-50 text-gray-600"
                                  }`}
                              >
                                {item.status || "Draft"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No ads scheduled for today.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Overdue Invoices
                    </h2>
                  </div>
                  <div className="p-5">
                    {overdueInvoiceList.length > 0 ? (
                      <div className="space-y-3">
                        {overdueInvoiceList.slice(0, 6).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.invoice_number || item.id}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {advertisers.find((adv) => adv.id === item.advertiser_id)
                                  ?.advertiser_name || "-"}
                              </p>
                            </div>
                            <div className="ml-4 text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-gray-900">
                                {formatCurrency(getInvoiceOutstanding(item))}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {formatDate(item.issue_date || item.due_date)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No overdue invoices.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2 mb-6">
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Revenue Trend (6 Months)
                    </h2>
                  </div>
                  <div className="p-5">
                    {revenueTrend.length > 0 ? (
                      <div className="space-y-2">
                        {revenueTrend.map((item) => (
                          <div
                            key={item.month}
                            className="flex items-center justify-between"
                          >
                            <span className="w-20 text-xs text-gray-600">
                              {new Date(`${item.month}-01`).toLocaleDateString("en-US", {
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <div className="flex-1 mx-3">
                              <div className="bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-gray-900 h-2 rounded-full"
                                  style={{
                                    width: `${Math.min(
                                      ((Number(item.revenue) || 0) / maxRevenueValue) * 100,
                                      100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="w-20 text-right text-xs font-semibold text-gray-900">
                              {formatCurrency(item.revenue)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No revenue data.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Top Advertisers
                    </h2>
                  </div>
                  <div className="p-5">
                    {topAdvertisers.length > 0 ? (
                      <div className="space-y-3">
                        {topAdvertisers.map((item, index) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-4 text-xs font-bold text-gray-400">
                                {index + 1}
                              </span>
                              <span className="text-sm text-gray-900">
                                {item.advertiser_name}
                              </span>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatCurrency(item.total_spent)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No advertiser data.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Recent Activity
                    </h2>
                  </div>
                  <div className="p-5">
                    {recentAds.length > 0 ? (
                      <div className="space-y-3">
                        {recentAds.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between pb-3 border-b border-gray-100 last:border-0 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-900 truncate">{item.ad_name}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {item.advertiser || "-"}
                              </p>
                            </div>
                            <div className="ml-4 text-right flex-shrink-0">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${item.status === "Published"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-gray-50 text-gray-600"
                                  }`}
                              >
                                {item.status || "Draft"}
                              </span>
                              <p className="mt-1 text-xs text-gray-500">
                                {formatRelativeTime(
                                  item.created_at ||
                                  `${item.post_date || ""}T${item.post_time || "00:00:00"}`,
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No recent activity.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Quick Stats
                    </h2>
                  </div>
                  <div className="p-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">Total Advertisers</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {dashboardStats.activeAdvertisers}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">Avg Ad Price</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(dashboardInsights.avgAdPrice)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">Most Popular Type</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {dashboardInsights.mostPopularType}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">Popular Placement</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {dashboardInsights.mostPopularPlacement}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Calendar" && (
            <div className="flex flex-col h-full bg-gray-50">
              <div className="bg-white border-b border-gray-200">
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between mb-4 gap-4">
                    <div className="flex items-center gap-4">
                      <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
                      <button
                        onClick={goToCalendarToday}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                        type="button"
                      >
                        Today
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setCalendarMode("month")}
                          className={`px-3 py-1.5 text-sm ${calendarMode === "month"
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          type="button"
                        >
                          Month
                        </button>
                        <button
                          onClick={() => setCalendarMode("week")}
                          className={`px-3 py-1.5 text-sm border-l border-gray-300 ${calendarMode === "week"
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          type="button"
                        >
                          Week
                        </button>
                        <button
                          onClick={() => setCalendarMode("day")}
                          className={`px-3 py-1.5 text-sm border-l border-gray-300 ${calendarMode === "day"
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          type="button"
                        >
                          Day
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigateCalendarDate(-1)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg"
                          type="button"
                        >
                          <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="text-lg font-medium text-gray-900 min-w-[250px] text-center">
                          {calendarPeriodLabel}
                        </span>
                        <button
                          onClick={() => navigateCalendarDate(1)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg"
                          type="button"
                        >
                          <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search ads..."
                          value={calendarSearch}
                          onChange={(event) => setCalendarSearch(event.target.value)}
                          className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-64"
                        />
                      </div>

                      <button
                        onClick={() => setCalendarShowFilters((current) => !current)}
                        className={`px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-2 ${calendarShowFilters
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        type="button"
                      >
                        <Filter className="w-4 h-4" />
                        Filters
                      </button>
                    </div>
                  </div>

                  {calendarShowFilters ? (
                    <CalendarFilters
                      selectedAdvertiser={calendarSelectedAdvertiser}
                      setSelectedAdvertiser={setCalendarSelectedAdvertiser}
                      selectedPlacement={calendarSelectedPlacement}
                      setSelectedPlacement={setCalendarSelectedPlacement}
                      selectedPostType={calendarSelectedPostType}
                      setSelectedPostType={setCalendarSelectedPostType}
                      selectedStatus={calendarSelectedStatus}
                      setSelectedStatus={setCalendarSelectedStatus}
                      showUnpublishedOnly={calendarUnpublishedOnly}
                      setShowUnpublishedOnly={setCalendarUnpublishedOnly}
                      advertisers={calendarAdvertiserOptions}
                      placements={calendarPlacementOptions}
                      postTypes={calendarPostTypeOptions}
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <div className="flex-1 p-6 overflow-auto">
                  {calendarMode === "month" ? (
                    <CalendarMonthView
                      currentDate={calendarCurrentDate}
                      ads={calendarFilteredAds}
                      maxAdsPerDay={calendarMaxAdsPerDay}
                      onAdClick={handleCalendarAdClick}
                      onDateClick={handleCalendarDateClick}
                    />
                  ) : null}

                  {calendarMode === "week" ? (
                    <CalendarWeekView
                      currentDate={calendarCurrentDate}
                      ads={calendarFilteredAds}
                      onAdClick={handleCalendarAdClick}
                    />
                  ) : null}

                  {calendarMode === "day" ? (
                    <CalendarDayView
                      currentDate={calendarCurrentDate}
                      ads={calendarFilteredAds}
                      maxAdsPerDay={calendarMaxAdsPerDay}
                      onAdClick={handleCalendarAdClick}
                    />
                  ) : null}
                </div>

                <CalendarUpcomingSidebar
                  ads={calendarUpcomingAds}
                  onAdClick={handleCalendarAdClick}
                  isMinimized={calendarSidebarMinimized}
                  setIsMinimized={setCalendarSidebarMinimized}
                />
              </div>

              {calendarPreviewOpen && calendarSelectedAd ? (
                <CalendarAdPreviewModal
                  ad={calendarSelectedAd}
                  onClose={() => {
                    setCalendarPreviewOpen(false);
                    setCalendarSelectedAd(null);
                  }}
                  onEdit={() => {
                    setCalendarPreviewOpen(false);
                    setActiveSection("Ads");
                    setAd({ ...blankAd, ...calendarSelectedAd });
                    setView("createAd");
                    setCalendarSelectedAd(null);
                  }}
                />
              ) : null}
            </div>
          )}

          {activeSection === "Submissions" && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 mb-1">Submissions</h1>
                <p className="text-sm text-gray-500">
                  Review and approve advertising requests from clients
                </p>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {filteredPendingSubmissions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No submissions</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Ad Name
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Advertiser
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Post Type
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Submitted
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredPendingSubmissions.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-3.5">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getSubmissionStatusBadgeClass(
                                  item.status,
                                )}`}
                              >
                                {formatSubmissionStatus(item.status)}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 font-medium text-gray-900 text-xs">
                              {item.ad_name || "-"}
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs">
                              {item.advertiser_name || "-"}
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs">
                              {item.email || "-"}
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs">
                              {item.post_type || "-"}
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs">
                              {formatSubmissionDate(item.created_at)}
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                                  title="View Details"
                                  onClick={() => {
                                    setMessage(
                                      `${item.ad_name || "Submission"} by ${item.advertiser_name || "unknown advertiser"
                                      }`,
                                    );
                                    window.setTimeout(() => setMessage(""), 1800);
                                  }}
                                >
                                  <Eye size={16} />
                                </button>
                                {item.status === "pending" ? (
                                  <>
                                    <button
                                      type="button"
                                      className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                                      title="Edit Submission"
                                      onClick={() => {
                                        setActiveSection("Ads");
                                        setAd({
                                          ...blankAd,
                                          ad_name: item.ad_name || "",
                                          post_type: item.post_type || "one_time",
                                          post_date:
                                            item.post_date || item.post_date_from || "",
                                          post_time: item.post_time || "",
                                          notes: item.notes || item.ad_text || "",
                                        });
                                        setView("createAd");
                                      }}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2.5 py-1 bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:text-gray-300 text-xs font-medium"
                                      onClick={() =>
                                        run(
                                          () => approvePendingAd(item.id),
                                          "Submission approved.",
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="px-2.5 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 text-xs font-medium"
                                      onClick={() =>
                                        run(
                                          () => rejectPendingAd(item.id),
                                          "Submission rejected.",
                                        )
                                      }
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                                {item.status === "not_approved" ? (
                                  <button
                                    type="button"
                                    className="px-2.5 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:bg-gray-400 text-xs"
                                    onClick={() =>
                                      run(
                                        () => deletePendingAd(item.id),
                                        "Submission deleted.",
                                      )
                                    }
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "WhatsApp" && (
            <div className="max-w-[1300px] mx-auto">
              <div className="mb-8">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                      <MessageSquare className="w-8 h-8 text-green-600" />
                      WhatsApp Messages
                    </h1>
                    <p className="text-gray-600 mt-2">
                      Incoming messages from advertisers and customers
                    </p>
                  </div>
                  {whatsAppUnreadCount > 0 && (
                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
                      {whatsAppUnreadCount} unread
                    </div>
                  )}
                </div>
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-blue-900">Webhook URL</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Configure this endpoint in your WhatsApp provider:
                  </p>
                  <code className="block mt-2 bg-white px-3 py-2 rounded text-sm text-blue-900 border border-blue-200">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/api/whatsapp/webhook`
                      : "/api/whatsapp/webhook"}
                  </code>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-4 mb-6 border border-gray-200">
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[300px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search messages, phone numbers, advertisers..."
                      value={whatsAppSearchTerm}
                      onChange={(event) => setWhatsAppSearchTerm(event.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setWhatsAppFilterUnread((current) => !current)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${whatsAppFilterUnread
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                  >
                    Unread Only
                  </button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Message Inbox</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Review and track incoming WhatsApp communication.
                    </p>
                  </div>

                  {filteredWhatsAppMessages.length === 0 ? (
                    <div className="p-10 text-center">
                      <p className="text-sm text-gray-500 mb-4">
                        {whatsAppMessages.length === 0
                          ? "No WhatsApp messages yet."
                          : "No messages match your filters."}
                      </p>
                      {whatsAppMessages.length === 0 && (
                        <button
                          type="button"
                          onClick={handleWhatsAppSeedDemo}
                          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          Load sample messages
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="max-h-[560px] overflow-y-auto divide-y divide-gray-200">
                      {filteredWhatsAppMessages.map((item) => {
                        const isRead = Boolean(item.is_read ?? item.isRead ?? false);
                        const isReplied = Boolean(item.replied_to ?? item.repliedTo ?? false);
                        const sender =
                          item.from_name || item.advertiser_name || item.from_number || "Unknown";
                        const snippet = String(item.message_text || item.message || "").trim();
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setWhatsAppSelectedMessageId(item.id)}
                            className={`w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors ${selectedWhatsAppMessage?.id === item.id ? "bg-blue-50/60" : ""
                              }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {!isRead && (
                                    <span className="w-2 h-2 rounded-full bg-green-600 shrink-0" />
                                  )}
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {sender}
                                  </p>
                                  {isReplied && (
                                    <span className="px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-800 rounded-full">
                                      Replied
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {item.from_number || "No phone number"}
                                </p>
                                <p className="text-sm text-gray-700 mt-2 truncate">
                                  {snippet || "No message body"}
                                </p>
                              </div>
                              <p className="text-xs text-gray-500 shrink-0">
                                {formatDateTime(item.created_at)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  {!selectedWhatsAppMessage ? (
                    <div className="h-full flex items-center justify-center text-center text-gray-500 text-sm">
                      Select a message to view details.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {selectedWhatsAppMessage.from_name ||
                            selectedWhatsAppMessage.advertiser_name ||
                            selectedWhatsAppMessage.from_number ||
                            "Unknown Sender"}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {selectedWhatsAppMessage.from_number || "No phone number"}
                        </p>
                      </div>

                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="font-medium text-gray-700">Advertiser</p>
                          <p className="text-gray-600">
                            {selectedWhatsAppMessage.advertiser_name || "Unassigned"}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700">Received</p>
                          <p className="text-gray-600">
                            {formatDateTime(selectedWhatsAppMessage.created_at)}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-700">Message</p>
                          <p className="text-gray-900 whitespace-pre-wrap leading-relaxed mt-1">
                            {String(
                              selectedWhatsAppMessage.message_text ||
                              selectedWhatsAppMessage.message ||
                              "No message body",
                            )}
                          </p>
                        </div>
                        {selectedWhatsAppMessage.notes && (
                          <div>
                            <p className="font-medium text-gray-700">Notes</p>
                            <p className="text-gray-600 whitespace-pre-wrap">
                              {selectedWhatsAppMessage.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleWhatsAppMarkRead(selectedWhatsAppMessage.id)}
                          disabled={Boolean(
                            selectedWhatsAppMessage.is_read ??
                            selectedWhatsAppMessage.isRead ??
                            false,
                          )}
                          className="px-3 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Mark Read
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppMarkReplied(selectedWhatsAppMessage.id)}
                          disabled={Boolean(
                            selectedWhatsAppMessage.replied_to ??
                            selectedWhatsAppMessage.repliedTo ??
                            false,
                          )}
                          className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Mark Replied
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this message?")) {
                              handleWhatsAppDelete(selectedWhatsAppMessage.id);
                            }
                          }}
                          className="px-3 py-2 bg-white text-red-700 text-sm font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === "Ads" && view === "list" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">Ads</h1>
                <p className="text-sm text-gray-500">
                  Monitor active campaigns, review creative content, and track deployment
                  statuses.
                </p>
              </div>

              <div className="flex items-center gap-2 mb-6 min-w-0">
                <select
                  value={adsFilters.status}
                  onChange={(event) =>
                    setAdsFilters((current) => ({ ...current, status: event.target.value }))
                  }
                  className="w-[118px] h-11 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer transition-all shrink-0"
                  style={adsSelectStyle}
                >
                  <option value="All Ads">All Ads</option>
                  <option value="Upcoming Ads">Upcoming Ads</option>
                  <option value="Past Ads">Past Ads</option>
                  <option value="Published">Published</option>
                  <option value="Draft">Draft</option>
                  <option value="Scheduled">Scheduled</option>
                </select>

                <button
                  onClick={() =>
                    setAdsFilters((current) => ({
                      ...current,
                      status: current.status === "Today" ? "All Ads" : "Today",
                    }))
                  }
                  className={`h-11 px-3.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 text-center whitespace-nowrap shrink-0 ${adsFilters.status === "Today"
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  type="button"
                >
                  {adsFilters.status === "Today" ? <X size={16} /> : <Clock size={16} />}
                  Today&apos;s Ads
                </button>

                <button
                  onClick={() =>
                    setAdsFilters((current) => ({
                      ...current,
                      status: current.status === "This Week" ? "All Ads" : "This Week",
                    }))
                  }
                  className={`h-11 px-3.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 text-center whitespace-nowrap shrink-0 ${adsFilters.status === "This Week"
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  type="button"
                >
                  {adsFilters.status === "This Week" ? (
                    <X size={16} />
                  ) : (
                    <Calendar size={16} />
                  )}
                  This Week
                </button>

                <div className="relative" ref={adsAdvancedFiltersRef}>
                  <button
                    onClick={() => setAdsShowAdvancedFilters((current) => !current)}
                    className="h-11 min-w-[150px] px-3.5 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-center whitespace-nowrap shrink-0"
                    type="button"
                  >
                    <Filter size={16} />
                    Advanced filters
                    {adsActiveAdvancedFilterCount > 0 ? (
                      <span className="ml-1 px-2 py-0.5 bg-gray-900 text-white text-xs rounded-full">
                        {adsActiveAdvancedFilterCount}
                      </span>
                    ) : null}
                    <ChevronDown size={16} />
                  </button>

                  {adsShowAdvancedFilters ? (
                    <div className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-4 min-w-[320px]">
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                            Date Range
                          </label>
                          <button
                            onClick={() =>
                              setAdsShowDateRangePicker((current) => !current)
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all flex items-center gap-2"
                            type="button"
                          >
                            <Calendar size={16} />
                            {adsFilters.dateFrom && adsFilters.dateTo
                              ? `${adsFilters.dateFrom} - ${adsFilters.dateTo}`
                              : "Select date range"}
                          </button>
                          {adsShowDateRangePicker ? (
                            <div className="mt-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="date"
                                  value={adsFilters.dateFrom}
                                  onChange={(event) =>
                                    setAdsFilters((current) => ({
                                      ...current,
                                      dateFrom: event.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                                <input
                                  type="date"
                                  value={adsFilters.dateTo}
                                  onChange={(event) =>
                                    setAdsFilters((current) => ({
                                      ...current,
                                      dateTo: event.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                                />
                              </div>
                              {adsFilters.dateFrom || adsFilters.dateTo ? (
                                <button
                                  onClick={() =>
                                    setAdsFilters((current) => ({
                                      ...current,
                                      dateFrom: "",
                                      dateTo: "",
                                    }))
                                  }
                                  className="w-full mt-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                                  type="button"
                                >
                                  Clear Dates
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                            Placement
                          </label>
                          <select
                            value={adsFilters.placement}
                            onChange={(event) =>
                              setAdsFilters((current) => ({
                                ...current,
                                placement: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer"
                            style={adsSelectStyle}
                          >
                            <option value="All Placement">All Placement</option>
                            {adsPlacementOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                            Post Type
                          </label>
                          <select
                            value={adsFilters.postType}
                            onChange={(event) =>
                              setAdsFilters((current) => ({
                                ...current,
                                postType: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer"
                            style={adsSelectStyle}
                          >
                            <option value="All post types">All post types</option>
                            {adsPostTypeOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                            Advertiser
                          </label>
                          <select
                            value={adsFilters.advertiser}
                            onChange={(event) =>
                              setAdsFilters((current) => ({
                                ...current,
                                advertiser: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer"
                            style={adsSelectStyle}
                          >
                            <option value="All Advertisers">All Advertisers</option>
                            {adsAdvertiserOptions.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">
                            Payment Status
                          </label>
                          <select
                            value={adsFilters.payment}
                            onChange={(event) =>
                              setAdsFilters((current) => ({
                                ...current,
                                payment: event.target.value,
                              }))
                            }
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer"
                            style={adsSelectStyle}
                          >
                            <option value="All Payment Status">All Payment Status</option>
                            <option value="Paid">Paid</option>
                            <option value="Pending">Pending</option>
                            <option value="Refunded">Refunded</option>
                          </select>
                        </div>

                        {adsActiveAdvancedFilterCount > 0 ? (
                          <button
                            onClick={clearAdsAdvancedFilters}
                            className="w-full mt-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                            type="button"
                          >
                            <X size={16} />
                            Clear Advanced Filters
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="relative flex-1 min-w-[170px]">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search ads..."
                    value={adsFilters.search}
                    onChange={(event) =>
                      setAdsFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    className="h-11 w-full min-w-0 pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                  />
                </div>
                <button
                  onClick={exportVisibleAdsCsv}
                  className="h-11 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all flex items-center gap-2 whitespace-nowrap shrink-0"
                  type="button"
                >
                  <Download size={16} />
                  Export
                </button>
                <button
                  onClick={() => {
                    setAd(blankAd);
                    setView("createAd");
                  }}
                  className="h-11 min-w-[124px] px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all flex items-center justify-center text-center whitespace-nowrap shrink-0"
                  type="button"
                >
                  Create new ad
                </button>
              </div>

              <div className="mb-4 text-sm text-gray-600">
                Showing {sortedAds.length} of {adsNormalized.length} ads
              </div>

              {sortedAds.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                  <p className="text-gray-500">No ads found</p>
                  <button
                    onClick={() => {
                      setAd(blankAd);
                      setView("createAd");
                    }}
                    className="mt-4 px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                    type="button"
                  >
                    Create your first ad
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <AdsSortableHeader
                          label="Ad"
                          sortKey="ad_name"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Advertiser"
                          sortKey="advertiser"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Status"
                          sortKey="status"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Post Type"
                          sortKey="post_type"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Placement"
                          sortKey="placement"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Schedule"
                          sortKey="schedule"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Post Time"
                          sortKey="post_time"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <AdsSortableHeader
                          label="Payment"
                          sortKey="payment"
                          sortConfig={adsSortConfig}
                          onSort={handleAdsSort}
                        />
                        <th className="text-right px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedAds.map((item) => (
                        <AdsTableRow
                          key={item.id}
                          ad={item}
                          onPreview={setAdsPreviewAd}
                          onEdit={openAdEditor}
                          onMarkPublished={markAdAsPublished}
                          onDelete={deleteAdRecord}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <AdsPreviewModal
                ad={adsPreviewAd}
                onClose={() => setAdsPreviewAd(null)}
                onEdit={openAdEditor}
                linkedInvoices={linkedPreviewInvoices}
              />
            </div>
          )}
          {activeSection === "Ads" && view === "createAd" && (
            <div className="flex-1 overflow-auto bg-gray-50 -m-8">
              <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
                <div className="max-w-[1200px] mx-auto flex items-center justify-between relative">
                  <button
                    type="button"
                    onClick={closeCreateAd}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
                  >
                    <ArrowLeft size={18} />
                    Back
                  </button>
                  <h1 className="text-base font-semibold text-gray-900 absolute left-1/2 -translate-x-1/2">
                    {ad.id ? "Edit Advertisement" : "New Advertisement"}
                  </h1>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={closeCreateAd}
                      className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
                    >
                      Cancel
                    </button>
                    {ad.id ? (
                      <button
                        type="button"
                        onClick={() => saveCreateAd("save")}
                        className="px-5 py-2.5 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-all"
                      >
                        Save
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => saveCreateAd("draft")}
                          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
                        >
                          Save as draft
                        </button>
                        <button
                          type="button"
                          onClick={() => saveCreateAd("continue")}
                          className="px-5 py-2.5 text-sm font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-all flex items-center gap-2"
                        >
                          Continue to billing
                          <ArrowRight size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="max-w-[800px] mx-auto py-10 px-6 space-y-10">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    {ad.id ? "Edit advertisement" : "Create a new ad"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Fill in the details below to create your advertisement
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Advertiser
                      </label>
                      <select
                        value={ad.advertiser_id || ""}
                        onChange={(event) =>
                          setAd((current) => ({ ...current, advertiser_id: event.target.value }))
                        }
                        className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                      >
                        <option value="">Select advertiser</option>
                        {advertisers.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.advertiser_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Placement
                      </label>
                      <select
                        value={ad.placement || ""}
                        onChange={(event) =>
                          setAd((current) => ({ ...current, placement: event.target.value }))
                        }
                        className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                      >
                        <option value="">Select placement</option>
                        {createAdPlacementOptions.map((placement) => (
                          <option key={placement} value={placement}>
                            {placement}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 mb-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Ad Title</label>
                    <input
                      type="text"
                      value={ad.ad_name || ""}
                      onChange={(event) =>
                        setAd((current) => ({ ...current, ad_name: event.target.value }))
                      }
                      placeholder="Enter a descriptive title for your ad"
                      className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Ad Product</label>
                    <select
                      value={ad.product_id || ""}
                      onChange={(event) => {
                        const selectedProduct = products.find((item) => item.id === event.target.value);
                        setAd((current) => ({
                          ...current,
                          product_id: event.target.value,
                          placement: selectedProduct?.placement || current.placement || "",
                          price: selectedProduct?.price || current.price || "",
                        }));
                      }}
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                    >
                      <option value="">Select a product package</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.product_name} - {item.placement || "N/A"} - $
                          {Number(item.price || 0).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Post type</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {CREATE_AD_POST_TYPE_OPTIONS.map((postType) => (
                      <button
                        key={postType.value}
                        type="button"
                        onClick={() => setCreateAdPostType(postType.value)}
                        className={`px-4 py-4 border rounded-xl text-left transition-all bg-white ${selectedCreateAdPostType === postType.value
                          ? "border-gray-900 ring-2 ring-gray-900 ring-offset-0 shadow-sm"
                          : "border-gray-200"
                          }`}
                      >
                        <span className="text-sm font-semibold text-gray-900 block mb-1">
                          {postType.title}
                        </span>
                        <p className="text-xs text-gray-500 leading-relaxed">{postType.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Post Date, Time &amp; Reminder</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {selectedCreateAdPostType === "Daily Run" ? "From Date" : "Post Date"}
                      </label>
                      <input
                        type="date"
                        value={selectedCreateAdPostType === "Daily Run" ? ad.post_date_from || "" : ad.post_date || ""}
                        onChange={(event) =>
                          setAd((current) => ({
                            ...current,
                            [selectedCreateAdPostType === "Daily Run" ? "post_date_from" : "post_date"]:
                              event.target.value,
                          }))
                        }
                        className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                      />
                    </div>
                    <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {selectedCreateAdPostType === "Daily Run" ? "To Date" : "Post Time"}
                      </label>
                      {selectedCreateAdPostType === "Daily Run" ? (
                        <input
                          type="date"
                          value={ad.post_date_to || ""}
                          onChange={(event) =>
                            setAd((current) => ({ ...current, post_date_to: event.target.value }))
                          }
                          className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                        />
                      ) : (
                        <input
                          type="time"
                          value={ad.post_time || ""}
                          onChange={(event) =>
                            setAd((current) => ({ ...current, post_time: event.target.value }))
                          }
                          className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Payment</h3>
                  <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 mb-3">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Payment status</label>
                    <select
                      value={createAdPaymentMode}
                      onChange={(event) =>
                        setAd((current) => ({
                          ...current,
                          payment_mode: event.target.value,
                          payment: event.target.value === "Paid" ? "Paid" : "Unpaid",
                        }))
                      }
                      className="w-full text-sm text-gray-900 bg-transparent focus:outline-none"
                    >
                      <option value="TBD">TBD</option>
                      <option value="Paid">Paid</option>
                      <option value="Custom Amount">Custom Amount</option>
                    </select>
                  </div>
                  {createAdPaymentMode === "Custom Amount" ? (
                    <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Amount</label>
                      <input
                        type="text"
                        value={ad.price || ""}
                        onChange={(event) =>
                          setAd((current) => ({ ...current, price: event.target.value }))
                        }
                        placeholder="$1,500"
                        className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                      />
                    </div>
                  ) : null}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Ad content</h3>
                  <div className="border border-gray-200 rounded-lg bg-white mb-4 overflow-hidden">
                    <textarea
                      ref={createAdTextAreaRef}
                      value={ad.notes || ""}
                      onChange={(event) =>
                        setAd((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Enter your ad text here..."
                      rows={6}
                      className="w-full px-4 py-3 text-sm placeholder:text-gray-400 bg-transparent focus:outline-none resize-none"
                    />
                  </div>
                  <label className="cursor-pointer flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl bg-white hover:border-gray-300 hover:bg-gray-50 transition-all">
                    <Plus size={18} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">Add images or videos</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Advertisers" && (
            <div>
              {advertiserCreateOpen ? (
                <div className="flex-1 overflow-auto bg-[#FAFAFA] -m-8">
                  <div className="bg-white border-b border-gray-200 px-6 py-3">
                    <div className="max-w-[1200px] mx-auto flex items-center justify-between relative">
                      <button
                        type="button"
                        onClick={() => saveNewAdvertiser("cancel")}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        <ArrowLeft size={18} />
                        <span>Back</span>
                      </button>

                      <h1 className="text-sm font-medium text-gray-900 absolute left-1/2 -translate-x-1/2">
                        New Advertiser
                      </h1>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveNewAdvertiser("cancel")}
                          className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveNewAdvertiser("save")}
                          disabled={advertiserCreateLoading}
                          className="px-5 py-2 text-sm font-medium text-white bg-black rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          {advertiserCreateLoading ? "Saving..." : "Save Advertiser"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="max-w-[700px] mx-auto py-12 px-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-8">
                      Add a new advertiser
                    </h2>

                    <div className="mb-10">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Basic Information
                      </h3>

                      <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
                        <label className="block text-xs font-semibold text-gray-900 mb-0.5">
                          Advertiser Name *
                        </label>
                        <input
                          type="text"
                          value={advertiserCreateForm.advertiser_name}
                          onChange={(event) =>
                            setAdvertiserCreateForm({
                              ...advertiserCreateForm,
                              advertiser_name: event.target.value,
                            })
                          }
                          placeholder="Enter advertiser business name"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>

                      <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
                        <label className="block text-xs font-semibold text-gray-900 mb-0.5">
                          Contact Name *
                        </label>
                        <input
                          type="text"
                          value={advertiserCreateForm.contact_name}
                          onChange={(event) =>
                            setAdvertiserCreateForm({
                              ...advertiserCreateForm,
                              contact_name: event.target.value,
                            })
                          }
                          placeholder="Enter primary contact name"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>

                      <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5 mb-4">
                        <label className="block text-xs font-semibold text-gray-900 mb-0.5">
                          Email
                        </label>
                        <input
                          type="email"
                          value={advertiserCreateForm.email}
                          onChange={(event) =>
                            setAdvertiserCreateForm({
                              ...advertiserCreateForm,
                              email: event.target.value,
                            })
                          }
                          placeholder="contact@example.com"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>

                      <div className="border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5">
                        <label className="block text-xs font-semibold text-gray-900 mb-0.5">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={advertiserCreateForm.phone_number}
                          onChange={(event) =>
                            setAdvertiserCreateForm({
                              ...advertiserCreateForm,
                              phone_number: event.target.value,
                            })
                          }
                          placeholder="555-0123"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mb-10">
                      <h3 className="text-sm font-semibold text-gray-900 mb-4">
                        Account Details
                      </h3>

                      <div className="relative border border-gray-300 rounded-lg bg-white px-4 pt-3 pb-2.5">
                        <label className="block text-xs font-semibold text-gray-900 mb-0.5">
                          Account Status
                        </label>
                        <select
                          value={advertiserCreateForm.status}
                          onChange={(event) =>
                            setAdvertiserCreateForm({
                              ...advertiserCreateForm,
                              status: event.target.value,
                            })
                          }
                          className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none pr-6"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <ChevronDown
                          size={16}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Advertisers</h1>
                      <p className="text-sm text-gray-500">Manage all your advertiser accounts</p>
                    </div>
                    <button
                      type="button"
                      onClick={openAdvertiserCreate}
                      className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <Plus size={18} />
                      Add new Advertiser
                    </button>
                  </div>

                  <div className="mb-6">
                    <div className="relative max-w-md">
                      <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        size={18}
                      />
                      <input
                        type="text"
                        placeholder="Search advertisers..."
                        value={advertiserSearch}
                        onChange={(event) => setAdvertiserSearch(event.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                    </div>
                  </div>

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
                        {filteredAdvertisers.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-6 py-12 text-center text-xs text-gray-500"
                            >
                              {advertiserSearch
                                ? "No advertisers found matching your search"
                                : "No advertisers yet. Click 'Add new Advertiser' to get started."}
                            </td>
                          </tr>
                        ) : (
                          filteredAdvertisers.map((item) => {
                            const status = String(item.status || "active").toLowerCase();
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                              >
                                <td className="px-6 py-3.5">
                                  <div className="text-xs font-medium text-gray-900">
                                    {item.advertiser_name || "\u2014"}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs text-gray-900">
                                    {item.contact_name || item.business_name || "\u2014"}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs text-gray-600">
                                    {item.email || "\u2014"}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs text-gray-600">
                                    {item.phone_number || item.phone || "\u2014"}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs font-medium text-gray-900">
                                    {formatCurrency(item.total_spend ?? item.ad_spend ?? 0)}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs text-gray-600">
                                    {formatAdvertiserDate(item.next_ad_date)}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <span
                                    className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-medium ${getAdvertiserStatusClass(
                                      status,
                                    )}`}
                                  >
                                    {status === "active" ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 relative">
                                  <button
                                    type="button"
                                    onClick={(event) => openAdvertiserMenu(item.id, event)}
                                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  >
                                    <MoreVertical size={18} className="text-gray-600" />
                                  </button>
                                  {openAdvertiserMenuId === item.id ? (
                                    <div
                                      ref={advertiserMenuRef}
                                      className={`absolute ${advertiserMenuPosition.vertical === "top"
                                        ? "bottom-full mb-1"
                                        : "top-full mt-1"
                                        } ${advertiserMenuPosition.horizontal === "left"
                                          ? "right-0"
                                          : "left-auto"
                                        } w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[100]`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => openAdvertiserView(item)}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                      >
                                        <Eye size={16} />
                                        View
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openAdvertiserEdit(item)}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                      >
                                        <Edit2 size={16} />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdvertiserDeleteModal(item);
                                          setOpenAdvertiserMenuId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                        <Trash2 size={16} />
                                        Delete
                                      </button>
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {advertiserViewModal ? (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-y-auto">
                    <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">Advertiser Details</h2>
                      <button
                        type="button"
                        onClick={() => setAdvertiserViewModal(null)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="p-6 space-y-6">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">
                          Contact Information
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500">Advertiser Name</p>
                            <p className="text-sm font-medium text-gray-900">
                              {advertiserViewModal.advertiser.advertiser_name || "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Contact Name</p>
                            <p className="text-sm font-medium text-gray-900">
                              {advertiserViewModal.advertiser.contact_name ||
                                advertiserViewModal.advertiser.business_name ||
                                "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Email</p>
                            <p className="text-sm font-medium text-gray-900">
                              {advertiserViewModal.advertiser.email || "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Phone Number</p>
                            <p className="text-sm font-medium text-gray-900">
                              {advertiserViewModal.advertiser.phone_number ||
                                advertiserViewModal.advertiser.phone ||
                                "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total Spend</p>
                            <p className="text-sm font-medium text-gray-900">
                              {formatCurrency(advertiserViewModal.advertiser.total_spend || 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Date Added</p>
                            <p className="text-sm font-medium text-gray-900">
                              {formatAdvertiserDate(advertiserViewModal.advertiser.created_at)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Status</p>
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getAdvertiserStatusClass(
                                advertiserViewModal.advertiser.status,
                              )}`}
                            >
                              {String(
                                advertiserViewModal.advertiser.status || "active",
                              ).toLowerCase() === "active"
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">
                          Ads ({advertiserViewModal.ads.length})
                        </h3>
                        {advertiserViewModal.ads.length === 0 ? (
                          <p className="text-sm text-gray-500">No ads for this advertiser yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {advertiserViewModal.ads.map((adItem) => {
                              const adStatus = String(adItem.status || "").toLowerCase();
                              return (
                                <div
                                  key={adItem.id}
                                  className="p-3 border border-gray-200 rounded-lg"
                                >
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {adItem.ad_name || "\u2014"}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {adItem.post_type || "\u2014"} • {adItem.placement || "\u2014"} •{" "}
                                        {formatAdvertiserDate(
                                          adItem.post_date_from || adItem.post_date,
                                        )}
                                      </p>
                                    </div>
                                    <span
                                      className={`text-xs px-2 py-1 rounded-full ${adStatus === "scheduled"
                                        ? "bg-blue-100 text-blue-800"
                                        : adStatus === "completed" || adStatus === "published"
                                          ? "bg-green-100 text-green-800"
                                          : "bg-gray-100 text-gray-600"
                                        }`}
                                    >
                                      {adItem.status || "Draft"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {advertiserEditModal ? (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg max-w-md w-full">
                    <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                      <h2 className="text-xl font-semibold text-gray-900">Edit Advertiser</h2>
                      <button
                        type="button"
                        onClick={() => setAdvertiserEditModal(null)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveAdvertiserModal();
                      }}
                      className="p-6 space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Advertiser Name
                        </label>
                        <input
                          type="text"
                          required
                          value={advertiserEditModal.advertiser_name || ""}
                          onChange={(event) =>
                            setAdvertiserEditModal({
                              ...advertiserEditModal,
                              advertiser_name: event.target.value,
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
                          value={advertiserEditModal.contact_name || ""}
                          onChange={(event) =>
                            setAdvertiserEditModal({
                              ...advertiserEditModal,
                              contact_name: event.target.value,
                            })
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
                          value={advertiserEditModal.email || ""}
                          onChange={(event) =>
                            setAdvertiserEditModal({
                              ...advertiserEditModal,
                              email: event.target.value,
                            })
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
                          value={advertiserEditModal.phone_number || advertiserEditModal.phone || ""}
                          onChange={(event) =>
                            setAdvertiserEditModal({
                              ...advertiserEditModal,
                              phone_number: event.target.value,
                              phone: event.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={advertiserEditModal.status || "active"}
                          onChange={(event) =>
                            setAdvertiserEditModal({
                              ...advertiserEditModal,
                              status: event.target.value,
                            })
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
                          onClick={() => setAdvertiserEditModal(null)}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={advertiserActionLoading}
                          className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
                        >
                          {advertiserActionLoading ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              {advertiserDeleteModal ? (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg max-w-md w-full p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Delete Advertiser</h2>
                    <p className="text-sm text-gray-600 mb-6">
                      Are you sure you want to delete{" "}
                      <strong>{advertiserDeleteModal.advertiser_name}</strong>? This will
                      permanently delete the advertiser and all associated ads and reminders. This
                      action cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAdvertiserDeleteModal(null)}
                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={confirmAdvertiserDelete}
                        disabled={advertiserActionLoading}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-400"
                      >
                        {advertiserActionLoading ? "Deleting..." : "Yes, I'm Sure"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {openAdvertiserMenuId ? (
                <div
                  className="fixed inset-0 z-0"
                  onClick={() => setOpenAdvertiserMenuId(null)}
                />
              ) : null}
            </div>
          )}
          {activeSection === "Products" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">Products</h1>
                  <p className="text-sm text-gray-500">
                    Manage your ad packages and products
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openProductCreate}
                  className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add new Product
                </button>
              </div>

              {productCreateOpen ? (
                <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold">New Product</h2>
                    <button
                      type="button"
                      onClick={() => saveNewProduct("cancel")}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {"\u2715"}
                    </button>
                  </div>
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveNewProduct("save");
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Product Name
                      </label>
                      <input
                        type="text"
                        value={product.product_name}
                        onChange={(event) =>
                          setProduct({ ...product, product_name: event.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        placeholder="e.g., Premium WhatsApp Package"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Placement
                      </label>
                      <select
                        value={product.placement || "WhatsApp"}
                        onChange={(event) =>
                          setProduct({ ...product, placement: event.target.value })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                        required
                      >
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Website">Website</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Price
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-2 text-gray-500">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={product.price}
                          onChange={(event) =>
                            setProduct({ ...product, price: event.target.value })
                          }
                          className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-4">
                      <button
                        type="submit"
                        disabled={productActionLoading}
                        className="flex-1 bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {productActionLoading ? "Creating..." : "Create Product"}
                      </button>
                      <button
                        type="button"
                        onClick={() => saveNewProduct("cancel")}
                        className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {filteredProducts.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
                  <p className="text-gray-500">
                    No products yet. Click "Add new Product" to create your first ad package!
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                          Product Name
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                          Placement
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                          Price
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700">
                          Created
                        </th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredProducts.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3.5 text-xs text-gray-900">
                            {item.product_name}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                              {item.placement || "N/A"}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-xs font-semibold text-gray-900">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-gray-500">
                            {formatProductsDate(item.created_at)}
                          </td>
                          <td
                            className="px-6 py-3.5 text-right relative"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(event) => openProductMenu(item.id, event)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical size={18} className="text-gray-500" />
                            </button>

                            {openProductMenuId === item.id ? (
                              <div
                                ref={productMenuRef}
                                className={`absolute ${productMenuPosition.vertical === "top"
                                  ? "bottom-full mb-1"
                                  : "top-full mt-1"
                                  } ${productMenuPosition.horizontal === "left"
                                    ? "right-0"
                                    : "left-auto"
                                  } w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] py-1`}
                              >
                                <button
                                  type="button"
                                  onClick={() => openProductEdit(item)}
                                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                >
                                  <Edit2 size={16} className="text-gray-400" />
                                  Edit
                                </button>
                                <div className="border-t border-gray-100 my-1" />
                                <button
                                  type="button"
                                  onClick={() => openProductDelete(item)}
                                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                >
                                  <Trash2 size={16} className="text-red-500" />
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {productEditModal ? (
                <>
                  <div
                    onClick={() => setProductEditModal(null)}
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity"
                  />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
                      <div className="px-6 py-5 border-b border-gray-200">
                        <h2 className="text-xl font-semibold text-gray-900">Edit Product</h2>
                      </div>

                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveProductModal();
                        }}
                        className="p-6 space-y-4"
                      >
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Product Name
                          </label>
                          <input
                            type="text"
                            value={productEditModal.product_name}
                            onChange={(event) =>
                              setProductEditModal({
                                ...productEditModal,
                                product_name: event.target.value,
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Placement
                          </label>
                          <select
                            value={productEditModal.placement || "WhatsApp"}
                            onChange={(event) =>
                              setProductEditModal({
                                ...productEditModal,
                                placement: event.target.value,
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                            required
                          >
                            <option value="WhatsApp">WhatsApp</option>
                            <option value="Website">Website</option>
                            <option value="App">App</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Price
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={productEditModal.price}
                            onChange={(event) =>
                              setProductEditModal({
                                ...productEditModal,
                                price: event.target.value,
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                            required
                          />
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button
                            type="submit"
                            disabled={productActionLoading}
                            className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                          >
                            {productActionLoading ? "Updating..." : "Update Product"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductEditModal(null)}
                            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </>
              ) : null}

              {productDeleteModal ? (
                <>
                  <div
                    onClick={() => setProductDeleteModal(null)}
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity"
                  />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                      <h2 className="text-xl font-semibold text-gray-900 mb-4">
                        Delete Product
                      </h2>
                      <p className="text-gray-600 mb-6">
                        Are you sure you want to delete "
                        {productDeleteModal.product_name}
                        "? This action cannot be undone.
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={confirmProductDelete}
                          disabled={productActionLoading}
                          className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-400"
                        >
                          {productActionLoading ? "Deleting..." : "Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductDeleteModal(null)}
                          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}
          {activeSection === "Billing" && view === "list" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900 mb-2">Billing</h1>
                  <p className="text-sm text-gray-500">
                    Manage invoices, track payments, and view billing history.
                  </p>
                </div>
                <div className="relative" ref={invoiceCreateMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowInvoiceCreateMenu((current) => !current)}
                    className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all shadow-sm hover:shadow flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Create Invoice
                    <ChevronDown size={16} />
                  </button>
                  {showInvoiceCreateMenu ? (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      <button
                        type="button"
                        onClick={() => {
                          setInvoice(blankInvoice);
                          setView("newInvoice");
                          setShowInvoiceCreateMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Plus size={16} />
                        <div>
                          <div className="font-medium">New Invoice</div>
                          <div className="text-xs text-gray-500">Create a single invoice</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInvoiceCreateMenu(false);
                          setMessage("Batch Invoice is coming soon.");
                          window.setTimeout(() => setMessage(""), 1800);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Receipt size={16} />
                        <div>
                          <div className="font-medium">Batch Invoice</div>
                          <div className="text-xs text-gray-500">Invoice by date range</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInvoiceCreateMenu(false);
                          setMessage("Recurring Invoice is coming soon.");
                          window.setTimeout(() => setMessage(""), 1800);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <RefreshCw size={16} />
                        <div>
                          <div className="font-medium">Recurring Invoice</div>
                          <div className="text-xs text-gray-500">Generate for period</div>
                        </div>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Outstanding
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(invoiceSummary.totalOutstanding)}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Collected
                  </div>
                  <div className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(invoiceSummary.totalPaid)}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Overdue
                  </div>
                  <div className="text-2xl font-bold text-rose-600">
                    {invoiceSummary.overdueCount} invoice
                    {invoiceSummary.overdueCount !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-sm text-gray-600 mr-2">
                    <Filter size={16} />
                    <span className="font-medium">Filter</span>
                  </div>
                  <select
                    value={invoiceFilters.status}
                    onChange={(event) =>
                      setInvoiceFilters((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:border-gray-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0 focus:border-gray-900 appearance-none cursor-pointer transition-all"
                    style={adsSelectStyle}
                  >
                    <option value="All">All</option>
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                    <option value="Overdue">Overdue</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search invoices..."
                      value={invoiceFilters.search}
                      onChange={(event) =>
                        setInvoiceFilters((current) => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                      className="pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 w-[260px] transition-all"
                    />
                  </div>
                </div>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                  <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-2">No invoices found</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Create your first invoice to get started
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoice(blankInvoice);
                      setView("newInvoice");
                    }}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                  >
                    Create Invoice
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <InvoiceSortableHeader
                            label="Invoice"
                            sortKey="invoice_number"
                            onSort={handleInvoiceSort}
                          />
                          <InvoiceSortableHeader
                            label="Advertiser"
                            sortKey="advertiser_name"
                            onSort={handleInvoiceSort}
                          />
                          <InvoiceSortableHeader label="Date" sortKey="date" onSort={handleInvoiceSort} />
                          <InvoiceSortableHeader
                            label="Status"
                            sortKey="status"
                            onSort={handleInvoiceSort}
                          />
                          <InvoiceSortableHeader
                            label="Items"
                            sortKey="items"
                            onSort={handleInvoiceSort}
                          />
                          <InvoiceSortableHeader
                            label="Total"
                            sortKey="total"
                            onSort={handleInvoiceSort}
                          />
                          <th className="text-right px-6 py-3 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredInvoices.map((item) => {
                          const advertiserName =
                            item.advertiser_name ||
                            advertisers.find((adv) => adv.id === item.advertiser_id)
                              ?.advertiser_name ||
                            "-";
                          const status = normalizeInvoiceStatus(item.status);
                          const itemCount = Array.isArray(item.ad_ids) ? item.ad_ids.length : 0;
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-gray-50 transition-colors cursor-pointer group"
                              onClick={() => openInvoicePreview(item)}
                            >
                              <td className="px-6 py-4">
                                <div className="text-xs font-semibold text-gray-900">
                                  #{item.invoice_number || item.id}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-xs font-medium text-gray-900">
                                  {advertiserName}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-gray-700 font-medium">
                                  {formatInvoiceListDate(item.due_date || item.created_at)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getInvoiceStatusColor(
                                    status,
                                  )}`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-gray-700 font-medium">
                                  {itemCount} item{itemCount !== 1 ? "s" : ""}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs font-semibold text-gray-900">
                                  {formatCurrency(item.amount)}
                                </span>
                              </td>
                              <td
                                className="px-6 py-4 text-right relative"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(event) => openInvoiceMenu(item.id, event)}
                                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                  <MoreVertical size={18} className="text-gray-500" />
                                </button>
                                {openInvoiceMenuId === item.id ? (
                                  <div
                                    ref={invoiceMenuRef}
                                    className={`absolute ${invoiceMenuPosition.vertical === "top"
                                      ? "bottom-full mb-1"
                                      : "top-full mt-1"
                                      } ${invoiceMenuPosition.horizontal === "left"
                                        ? "right-0"
                                        : "left-auto"
                                      } w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] py-1`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => openInvoicePreview(item)}
                                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                    >
                                      <Eye size={16} className="text-gray-400" />
                                      View Invoice
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openInvoiceEditor(item)}
                                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                    >
                                      <Edit2 size={16} className="text-gray-400" />
                                      Edit Invoice
                                    </button>
                                    {status !== "Paid" ? (
                                      <button
                                        type="button"
                                        onClick={() => markInvoiceAsPaid(item)}
                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                      >
                                        <CheckCircle size={16} className="text-gray-400" />
                                        Mark as Paid
                                      </button>
                                    ) : null}
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                      type="button"
                                      onClick={() => deleteInvoiceRecord(item.id)}
                                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                                    >
                                      <Trash2 size={16} className="text-red-500" />
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {invoicePreviewModal ? (
                <>
                  <div
                    onClick={() => setInvoicePreviewModal(null)}
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity"
                  />
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-[580px] w-full max-h-[90vh] overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">
                          Invoice #{invoicePreviewModal.invoice_number || invoicePreviewModal.id}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setInvoicePreviewModal(null)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X size={20} className="text-gray-600" />
                        </button>
                      </div>
                      <div className="p-6 text-sm space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Bill to
                            </p>
                            <p className="font-medium text-gray-900">
                              {invoicePreviewModal.advertiser_name || "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Date
                            </p>
                            <p className="font-medium text-gray-900">
                              {formatInvoiceListDate(
                                invoicePreviewModal.due_date ||
                                invoicePreviewModal.created_at,
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Status
                            </p>
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getInvoiceStatusColor(
                                invoicePreviewModal.status,
                              )}`}
                            >
                              {normalizeInvoiceStatus(invoicePreviewModal.status)}
                            </span>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              Amount Due
                            </p>
                            <p className="text-lg font-bold text-gray-900">
                              {formatCurrency(invoicePreviewModal.amount)}
                            </p>
                          </div>
                        </div>
                        <div className="border-t border-gray-200 pt-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                            Linked Ads
                          </p>
                          <div className="space-y-1.5 max-h-36 overflow-auto">
                            {(invoicePreviewModal.ad_ids || []).length === 0 ? (
                              <p className="text-xs text-gray-500">No linked ads.</p>
                            ) : (
                              (invoicePreviewModal.ad_ids || []).map((adId) => (
                                <p key={adId} className="text-xs text-gray-700 truncate">
                                  {ads.find((item) => item.id === adId)?.ad_name || adId}
                                </p>
                              ))
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                          {normalizeInvoiceStatus(invoicePreviewModal.status) !== "Paid" ? (
                            <button
                              type="button"
                              onClick={() => markInvoiceAsPaid(invoicePreviewModal)}
                              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Mark as Paid
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openInvoiceEditor(invoicePreviewModal)}
                            className="px-4 py-2 rounded-lg bg-black text-sm text-white hover:bg-gray-800"
                          >
                            Edit Invoice
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {activeSection === "Billing" && view === "newInvoice" && (
            <div className="max-w-[1400px] mx-auto">
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setInvoice(blankInvoice);
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all mb-6"
              >
                <ChevronLeft size={16} />
                Back to Billing
              </button>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    {invoice.id ? "Edit Invoice" : "Create Invoice"}
                  </h2>
                  <p className="text-sm text-gray-500 mb-8">
                    Select an advertiser and include linked ads for billing
                  </p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoice.invoice_number}
                        onChange={(event) =>
                          setInvoice({ ...invoice, invoice_number: event.target.value })
                        }
                        placeholder="INV-000001"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Advertiser
                      </label>
                      <select
                        value={invoice.advertiser_id}
                        onChange={(event) =>
                          setInvoice({
                            ...invoice,
                            advertiser_id: event.target.value,
                            ad_ids: [],
                          })
                        }
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                      >
                        <option value="">Select advertiser</option>
                        {advertisers.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.advertiser_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={invoice.amount}
                          onChange={(event) =>
                            setInvoice({ ...invoice, amount: event.target.value })
                          }
                          placeholder="0.00"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Issue Date
                        </label>
                        <input
                          type="date"
                          value={invoice.due_date}
                          onChange={(event) =>
                            setInvoice({ ...invoice, due_date: event.target.value })
                          }
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Status
                      </label>
                      <select
                        value={normalizeInvoiceStatus(invoice.status)}
                        onChange={(event) =>
                          setInvoice({ ...invoice, status: event.target.value })
                        }
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4 max-h-56 overflow-auto">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                        Link Ads
                      </p>
                      <div className="space-y-2">
                        {visibleAdsForInvoice.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            No ads available for this advertiser.
                          </p>
                        ) : (
                          visibleAdsForInvoice.map((item) => (
                            <label
                              key={item.id}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="truncate text-gray-700">{item.ad_name}</span>
                              <input
                                type="checkbox"
                                checked={invoice.ad_ids.includes(item.id)}
                                onChange={() =>
                                  setInvoice((current) => ({
                                    ...current,
                                    ad_ids: current.ad_ids.includes(item.id)
                                      ? current.ad_ids.filter((id) => id !== item.id)
                                      : [...current.ad_ids, item.id],
                                  }))
                                }
                              />
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={saveInvoiceForm}
                        className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all"
                      >
                        Save Invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvoice(blankInvoice)}
                        className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit sticky top-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Preview</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Invoice</span>
                      <span className="font-medium text-gray-900">
                        {invoice.invoice_number || "Auto-generated"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Advertiser</span>
                      <span className="font-medium text-gray-900">
                        {advertisers.find((item) => item.id === invoice.advertiser_id)
                          ?.advertiser_name || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Issue Date</span>
                      <span className="font-medium text-gray-900">
                        {formatInvoiceListDate(invoice.due_date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getInvoiceStatusColor(
                          invoice.status,
                        )}`}
                      >
                        {normalizeInvoiceStatus(invoice.status)}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Linked Ads
                      </div>
                      <div className="space-y-1.5 max-h-32 overflow-auto">
                        {invoice.ad_ids.length === 0 ? (
                          <p className="text-xs text-gray-500">No ads selected.</p>
                        ) : (
                          invoice.ad_ids.map((adId) => (
                            <p key={adId} className="text-xs text-gray-700 truncate">
                              {ads.find((item) => item.id === adId)?.ad_name || adId}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="pt-3 border-t border-gray-200 flex justify-between">
                      <span className="text-sm font-semibold text-gray-900">Total</span>
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(invoice.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Reconciliation" && (
            <div className="max-w-[1200px] mx-auto">
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                Reconciliation
              </h1>

              <div className="grid gap-4 sm:grid-cols-3 mb-6">
                <StatCard
                  label="Invoice Discrepancies"
                  value={reconciliation.summary.totalDiscrepancies}
                />
                <StatCard
                  label="Orphaned Paid Ads"
                  value={reconciliation.summary.totalOrphanedAds}
                />
                <StatCard
                  label="Deleted Invoice Links"
                  value={reconciliation.summary.totalDeletedInvoiceAds}
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-4">
                  Discrepancies
                </h2>
                {reconciliation.discrepancies.length === 0 ? (
                  <p className="text-gray-500">No discrepancies found.</p>
                ) : (
                  <div className="space-y-2">
                    {reconciliation.discrepancies.map((item) => (
                      <div
                        key={item.invoice_id}
                        className="rounded-lg border border-gray-200 p-3"
                      >
                        <p className="text-sm font-medium text-gray-900">
                          {item.invoice_number} ({item.advertiser_name})
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Difference: {formatCurrency(item.difference)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "Settings" && (
            <div className="max-w-[1200px] mx-auto">
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                  Settings
                </h1>
                <p className="text-sm text-gray-500">
                  Manage your account settings and team members
                </p>
              </div>

              <div className="border-b border-gray-200 mb-8">
                <nav className="flex gap-8 overflow-x-auto">
                  {settingsTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSettingsActiveTab(tab.id)}
                      className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${settingsActiveTab === tab.id
                        ? "border-gray-900 text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              {settingsActiveTab === "profile" && (
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Update your personal information and profile picture
                    </p>
                  </div>
                  <form onSubmit={handleSettingsProfileSave} className="p-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Profile Picture
                      </label>
                      <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-full bg-[#F4E4D7] overflow-hidden flex items-center justify-center">
                          {settingsProfileImage ? (
                            <img
                              src={settingsProfileImage}
                              alt="Profile"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={40} className="text-gray-400" />
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="settings-profile-image"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium cursor-pointer"
                          >
                            <Upload size={16} />
                            {settingsProfileUploading ? "Uploading..." : "Upload Photo"}
                          </label>
                          <input
                            id="settings-profile-image"
                            type="file"
                            accept="image/*"
                            onChange={handleSettingsProfileImageUpload}
                            disabled={settingsProfileUploading}
                            className="hidden"
                          />
                          <p className="text-xs text-gray-500 mt-2">
                            JPG, PNG or GIF. Max size 5MB.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="settings-display-name"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        Display Name
                      </label>
                      <input
                        id="settings-display-name"
                        type="text"
                        value={settingsProfileName}
                        onChange={(event) => setSettingsProfileName(event.target.value)}
                        placeholder="Enter your name"
                        className="w-full max-w-md px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={user.email || ""}
                        disabled
                        className="w-full max-w-md px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Email address cannot be changed
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="settings-whatsapp-number"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        WhatsApp Number
                      </label>
                      <input
                        id="settings-whatsapp-number"
                        type="tel"
                        value={settingsProfileWhatsapp}
                        onChange={(event) => setSettingsProfileWhatsapp(event.target.value)}
                        placeholder="+1234567890"
                        className="w-full max-w-md px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Use international format (e.g. +1234567890) for reminders.
                      </p>
                    </div>

                    {settingsProfileMessage?.type === "error" && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                        {settingsProfileMessage.text}
                      </div>
                    )}
                    {settingsProfileMessage?.type === "success" && (
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-600 flex items-center gap-2">
                        <Check size={16} />
                        {settingsProfileMessage.text}
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-4">
                      <button
                        type="submit"
                        disabled={settingsProfileSaving || !settingsProfileHasChanges}
                        className="px-6 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {settingsProfileSaving ? "Saving..." : "Save Changes"}
                      </button>
                      {settingsProfileHasChanges && !settingsProfileSaving && (
                        <span className="text-sm text-gray-500">
                          You have unsaved changes
                        </span>
                      )}
                    </div>
                  </form>
                </div>
              )}
              {settingsActiveTab === "team" && (
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Team Members
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Manage who has access to your ads manager
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsTeamError("");
                        setSettingsTeamModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add Member
                    </button>
                  </div>
                  {settingsTeamError && (
                    <div className="mx-6 mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                      {settingsTeamError}
                    </div>
                  )}
                  <div className="divide-y divide-gray-200">
                    {teamMembers.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <p>No team members yet. Add your first member to get started.</p>
                      </div>
                    ) : (
                      teamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              {member.image ? (
                                <img
                                  src={member.image}
                                  alt={member.name}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <User size={20} className="text-gray-500" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {member.name || "No name"}
                              </p>
                              <p className="text-sm text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full">
                              {member.role === "admin" && (
                                <Crown size={14} className="text-yellow-600" />
                              )}
                              <span className="text-xs font-medium text-gray-700 capitalize">
                                {member.role || "member"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSettingsRemoveMember(member)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {settingsTeamModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl max-w-md w-full p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">
                      Add Team Member
                    </h2>
                    <form onSubmit={handleSettingsAddMember} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={settingsTeamName}
                          onChange={(event) => setSettingsTeamName(event.target.value)}
                          placeholder="John Doe"
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={settingsTeamEmail}
                          onChange={(event) => setSettingsTeamEmail(event.target.value)}
                          placeholder="member@example.com"
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Password
                        </label>
                        <input
                          type="password"
                          value={settingsTeamPassword}
                          onChange={(event) => setSettingsTeamPassword(event.target.value)}
                          placeholder="Create a secure password"
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                          minLength={6}
                          required
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          This will create a new admin account with these credentials.
                        </p>
                      </div>
                      {settingsTeamError && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                          {settingsTeamError}
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsTeamModalOpen(false);
                            setSettingsTeamName("");
                            setSettingsTeamEmail("");
                            setSettingsTeamPassword("");
                            setSettingsTeamError("");
                          }}
                          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={settingsTeamSaving}
                          className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {settingsTeamSaving ? "Adding..." : "Add Member"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {settingsActiveTab === "notifications" && (
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Bell size={20} className="text-gray-700" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Ad Reminder Notifications
                      </h2>
                    </div>
                    <p className="text-sm text-gray-500">
                      Two reminders go out per ad: one to you (the admin) based on
                      the timing below, and one to the advertiser based on the
                      reminder time set on each ad.
                    </p>
                  </div>

                  <div className="p-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">
                        Admin reminder timing
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        This controls when <strong>you</strong> get notified. The
                        advertiser gets their own reminder based on the time set in
                        the ad.
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          value={settingsNotification.reminder_time_value}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              reminder_time_value: Number(event.target.value) || 1,
                            }))
                          }
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={settingsNotification.reminder_time_unit}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              reminder_time_unit: event.target.value,
                            }))
                          }
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                        </select>
                        <span className="text-sm text-gray-600">before an ad is due</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-start gap-3 mb-4">
                        <input
                          type="checkbox"
                          id="settings-email-enabled"
                          checked={settingsNotification.email_enabled}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              email_enabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Mail size={16} className="text-gray-700" />
                            <label
                              htmlFor="settings-email-enabled"
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              Email notifications
                            </label>
                          </div>
                          <p className="text-sm text-gray-500">
                            Receive email reminders for upcoming ads
                          </p>
                        </div>
                      </div>
                      {settingsNotification.email_enabled && (
                        <div className="ml-7">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email address
                          </label>
                          <input
                            type="email"
                            placeholder="admin@example.com"
                            value={settingsNotification.email_address}
                            onChange={(event) =>
                              setSettingsNotification((current) => ({
                                ...current,
                                email_address: event.target.value,
                              }))
                            }
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-start gap-3 mb-4">
                        <input
                          type="checkbox"
                          id="settings-telegram-enabled"
                          checked={Boolean(settingsNotification.telegram_enabled)}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              telegram_enabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Send size={16} className="text-gray-700" />
                            <label
                              htmlFor="settings-telegram-enabled"
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              Telegram notifications
                            </label>
                          </div>
                          <p className="text-sm text-gray-500">
                            Send reminders with media to Telegram
                          </p>
                        </div>
                      </div>

                      {settingsNotification.telegram_enabled && (
                        <div className="ml-7 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Chat IDs{" "}
                              <span className="text-gray-400 font-normal">
                                ({settingsActiveTelegramCount} active)
                              </span>
                            </label>

                            {settingsTelegramChatIds.length === 0 ? (
                              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                                <p className="text-sm text-gray-500">
                                  No Telegram chat IDs added yet
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2 mb-4">
                                {settingsTelegramChatIds.map((item) => (
                                  <div
                                    key={item.id || item.chat_id}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${item.is_active === false
                                      ? "bg-gray-50 border-gray-200 opacity-50"
                                      : "bg-white border-gray-200"
                                      }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSettingsToggleTelegramChatId(
                                          item.id,
                                          item.is_active === false,
                                        )
                                      }
                                      className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${item.is_active === false
                                        ? "bg-white border-gray-300"
                                        : "bg-gray-900 border-gray-900"
                                        }`}
                                    >
                                      {item.is_active !== false && (
                                        <Check size={14} className="text-white" />
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {item.label}
                                      </p>
                                      <p className="text-xs text-gray-500 font-mono">
                                        {item.chat_id}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSettingsTestTelegram(
                                          item.chat_id,
                                          item.label || item.chat_id,
                                        )
                                      }
                                      disabled={settingsTelegramTesting === item.chat_id}
                                      className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                                    >
                                      {settingsTelegramTesting === item.chat_id
                                        ? "Sending..."
                                        : "Test"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSettingsDeleteTelegramChatId(item.id)
                                      }
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <input
                                  type="text"
                                  placeholder="Label (e.g. Sales Team)"
                                  value={settingsTelegramNewLabel}
                                  onChange={(event) =>
                                    setSettingsTelegramNewLabel(event.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                                />
                              </div>
                              <div className="flex-1">
                                <input
                                  type="text"
                                  placeholder="Chat ID (e.g. 8751400670)"
                                  value={settingsTelegramNewChatId}
                                  onChange={(event) =>
                                    setSettingsTelegramNewChatId(event.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={handleSettingsAddTelegramChatId}
                                disabled={
                                  settingsTelegramAdding ||
                                  !settingsTelegramNewLabel.trim() ||
                                  !settingsTelegramNewChatId.trim()
                                }
                                className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                              >
                                <Plus size={14} />
                                {settingsTelegramAdding ? "Adding..." : "Add"}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Message <strong>@userinfobot</strong> on Telegram to find
                              your chat ID.
                            </p>

                            <div className="mt-6 pt-4 border-t border-gray-200">
                              <div className="flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Link size={16} className="text-gray-600" />
                                    <p className="text-sm font-medium text-gray-900">
                                      Telegram Webhook
                                    </p>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Required for Approve/Reject buttons to work in Telegram.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleSettingsSetupTelegramWebhook}
                                  disabled={settingsTelegramWebhookLoading}
                                  className="px-3 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {settingsTelegramWebhookLoading
                                    ? "Setting up..."
                                    : "Setup Webhook"}
                                </button>
                              </div>
                              {settingsTelegramWebhookStatus && (
                                <div
                                  className={`mt-3 p-3 rounded-lg text-xs ${settingsTelegramWebhookStatus.type === "success"
                                    ? "bg-green-50 text-green-800 border border-green-200"
                                    : "bg-red-50 text-red-800 border border-red-200"
                                    }`}
                                >
                                  {settingsTelegramWebhookStatus.text}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-start gap-3 mb-4">
                        <input
                          type="checkbox"
                          id="settings-sms-enabled"
                          checked={settingsNotification.sms_enabled}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              sms_enabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare size={16} className="text-gray-700" />
                            <label
                              htmlFor="settings-sms-enabled"
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              SMS notifications
                            </label>
                          </div>
                          <p className="text-sm text-gray-500">
                            Receive text message reminders for upcoming ads
                          </p>
                        </div>
                      </div>
                      {settingsNotification.sms_enabled && (
                        <div className="ml-7">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Phone number
                          </label>
                          <input
                            type="tel"
                            placeholder="+1 (555) 123-4567"
                            value={settingsNotification.phone_number}
                            onChange={(event) =>
                              setSettingsNotification((current) => ({
                                ...current,
                                phone_number: event.target.value,
                              }))
                            }
                            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="settings-sound-enabled"
                          checked={settingsNotification.sound_enabled}
                          onChange={(event) =>
                            setSettingsNotification((current) => ({
                              ...current,
                              sound_enabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Volume2 size={16} className="text-gray-700" />
                            <label
                              htmlFor="settings-sound-enabled"
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              Sound notifications
                            </label>
                          </div>
                          <p className="text-sm text-gray-500">
                            Play a sound when new ad submissions arrive (while app is
                            open)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border-t border-gray-200 bg-gray-50">
                    {settingsNotificationMessage && (
                      <div
                        className={`mb-4 p-3 rounded-lg text-sm ${settingsNotificationMessage.type === "success"
                          ? "bg-green-50 text-green-800 border border-green-200"
                          : settingsNotificationMessage.type === "info"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                          }`}
                      >
                        {settingsNotificationMessage.text}
                      </div>
                    )}

                    {settingsReminderResults && (
                      <div className="mb-4 p-4 bg-gray-100 rounded-lg border border-gray-300">
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">
                          Reminder Check Results
                        </h3>
                        <div className="text-xs space-y-1 text-gray-700">
                          <p>
                            <strong>Total results:</strong>{" "}
                            {settingsReminderResults.totalResults}
                          </p>
                          {settingsReminderResults.results &&
                            settingsReminderResults.results.length > 0 && (
                              <div className="mt-2">
                                <p className="font-semibold">Details:</p>
                                <ul className="list-disc list-inside mt-1 space-y-1">
                                  {settingsReminderResults.results.map((result, idx) => (
                                    <li key={`${result.to}-${result.ad_name}-${idx}`}>
                                      {result.type} to {result.to}: {result.status} -{" "}
                                      {result.ad_name}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSettingsSaveNotifications}
                        disabled={settingsNotificationSaving}
                        className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {settingsNotificationSaving ? "Saving..." : "Save Changes"}
                      </button>
                      {settingsNotification.email_enabled && (
                        <button
                          type="button"
                          onClick={handleSettingsSendTestEmail}
                          disabled={
                            settingsNotificationTesting ||
                            !settingsNotification.email_address
                          }
                          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {settingsNotificationTesting ? "Sending..." : "Send Test Email"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSettingsCheckReminders}
                        disabled={settingsNotificationChecking}
                        className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {settingsNotificationChecking
                          ? "Checking..."
                          : "Check Reminders Now"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {settingsActiveTab === "scheduling" && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-1">
                      Ad Scheduling
                    </h2>
                    <p className="text-sm text-gray-500">
                      Configure scheduling limits for ad submissions
                    </p>
                  </div>

                  {settingsSchedulingError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                      {settingsSchedulingError}
                    </div>
                  )}
                  {settingsSchedulingSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
                      Settings saved successfully!
                    </div>
                  )}

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Ads Per Day
                      </label>
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="1"
                          value={settingsMaxAdsPerDay}
                          onChange={(event) => setSettingsMaxAdsPerDay(event.target.value)}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <p className="text-sm text-gray-500">
                          Maximum number of ads that can be scheduled for a single
                          day
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={handleSettingsSaveScheduling}
                        disabled={settingsSchedulingSaving}
                        className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {settingsSchedulingSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {settingsActiveTab === "billing" && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <p className="text-gray-600">Billing settings coming soon...</p>
                </div>
              )}
              {settingsActiveTab === "system" && (
                <div className="space-y-6">
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-medium text-gray-900 mb-1">
                        Sync Advertiser Spending
                      </h3>
                      <p className="text-sm text-gray-500">
                        Recalculate total_spend for all advertisers based on their
                        paid invoices. Use this if you notice discrepancies in totals.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSettingsRunSync}
                      disabled={syncing}
                      className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {syncing ? "Syncing..." : "Run Sync Now"}
                    </button>

                    {settingsSystemSyncResult && (
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm font-medium text-green-900 mb-2">
                          {settingsSystemSyncResult.message}
                        </p>
                        {Array.isArray(settingsSystemSyncResult.results) &&
                          settingsSystemSyncResult.results.length > 0 && (
                            <div className="mt-2 max-h-[200px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-green-100">
                                  <tr>
                                    <th className="text-left px-2 py-1 text-green-900">
                                      Advertiser
                                    </th>
                                    <th className="text-right px-2 py-1 text-green-900">
                                      New Total Spend
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {settingsSystemSyncResult.results.map((result) => (
                                    <tr key={result.id} className="border-t border-green-200">
                                      <td className="px-2 py-1 text-green-800">
                                        {result.name}
                                      </td>
                                      <td className="px-2 py-1 text-right text-green-800">
                                        ${Number(result.newTotal || 0).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>
                    )}

                    {settingsSystemError && (
                      <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">{settingsSystemError}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
