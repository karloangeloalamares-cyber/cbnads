"use client";

export function meta() {
  return [{ title: "Dashboard — CBN Ads" }];
}


import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { createPortal } from "react-dom";
import {
  Bell,
  LogOut,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Globe,
  RefreshCw,
  Eye,
  Play,
  Receipt,
  Printer,
  Pencil,
  MoreVertical,
  Edit2,
  Trash2,
  Upload,
  Check,
  Crown,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Link,
  Volume2,
  X,
  EyeOff,
  Loader2,
  LayoutGrid,
  List,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import AdsSortableHeader from "@/components/AdsSortableHeader";
import { Modal } from "@/components/Modal";
import AdvertiserCreateAdSection from "@/components/AdvertiserCreateAdSection";
import CalendarFilters from "@/components/CalendarFilters";
import CalendarUpcomingSidebar from "@/components/CalendarUpcomingSidebar";
import CreateAdAdvertiserField from "@/components/CreateAdAdvertiserField";
import InvoiceSortableHeader from "@/components/InvoiceSortableHeader";
import { AdvertiserInfoSection } from "@/components/SubmitAdForm/AdvertiserInfoSection";
import { AdDetailsSection } from "@/components/SubmitAdForm/AdDetailsSection";
import { AdPreview } from "@/components/SubmitAdForm/AdPreview";
import { NotesSection } from "@/components/SubmitAdForm/NotesSection";
import { PostTypeSection } from "@/components/SubmitAdForm/PostTypeSection";
import { ScheduleSection } from "@/components/SubmitAdForm/ScheduleSection";
import { checkAdAvailability } from "@/lib/adAvailabilityClient";
import { getSignedInUser, signOut, updateCurrentUser } from "@/lib/localAuth";
import { appToast } from "@/lib/toast";
import { can, getVisibleSectionsForRole, isInternalRole, normalizeAppRole } from "@/lib/permissions";
import { formatPostTypeBadgeLabel, formatPostTypeLabel, normalizePostTypeValue } from "@/lib/postType";
import {
  formatUSPhoneNumber,
  isCompleteUSPhoneNumber,
  US_PHONE_INPUT_MAX_LENGTH,
} from "@/lib/phone";
import {
  formatDateKeyFromDate,
  formatDateTimeInAppTimeZone,
  getTodayDateInAppTimeZone,
  getTodayInAppTimeZone,
  isPastDateTimeInAppTimeZone,
} from "@/lib/timezone";
import {
  INVOICE_COMPANY_ADDRESS,
  INVOICE_COMPANY_EMAIL,
  INVOICE_COMPANY_NAME,
} from "@/lib/invoiceCompany";
import {
  createId,
  deleteAd,
  deleteAdvertiser,
  deleteInvoice,
  deletePendingAd,
  deleteTeamMember,
  deleteProduct,
  ensureDb,
  invalidateDbCache,
  getReconciliationReport,
  readDb,
  rejectPendingAd,
  resolveSupabaseSessionUser,
  saveAdminSettings,
  saveNotificationPreferences,
  subscribeDb,
  updateDb,
  updateAdStatus,
  upsertTeamMember,
  upsertAd,
  upsertAdvertiser,
  upsertInvoice,
  upsertProduct,
} from "@/lib/localDb";
import { useSubmissionNotifications } from "@/hooks/useSubmissionNotifications";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

const sections = [
  "Dashboard",
  "Create Ad",
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

const CREATE_AD_SUBMIT_TOAST_ID = "create-ad-submit-toast";
const INVOICE_SUBMIT_TOAST_ID = "invoice-submit-toast";
const getInvoiceActionToastId = (action, invoiceId) => `invoice-${action}-toast-${invoiceId}`;
const SUBMISSION_NOTIFICATION_EVENT = "cbn:pending-submission-created";
const SUBMISSION_NOTIFICATION_STORAGE_KEY = "cbn:pending-submission-created";
const ADMIN_CREATED_AD_NOTIFICATION_SOURCE = "admin-created-ad";
const SUBMISSION_REJECTION_REASON_STORAGE_KEY = "cbn:submission-rejection-reasons";
const DEFAULT_SUBMISSION_REJECTION_REASONS = [
  "No Image",
  "Prohibited Content",
  "Missing Required Details",
  "Incorrect Schedule Details",
  "Poor Image Quality",
];
const REVENUE_TREND_MIN_MONTH = { year: 2026, monthIndex: 0 }; // Jan 2026

const parseNotificationSignal = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
};

const emitSubmissionNotificationSignal = ({ source = "", id = "" } = {}) => {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    source: String(source || "").trim(),
    id: String(id || "").trim() || null,
    timestamp: Date.now(),
  };

  try {
    window.dispatchEvent(new CustomEvent(SUBMISSION_NOTIFICATION_EVENT, { detail: payload }));
  } catch {
    // Ignore local event dispatch failures.
  }

  try {
    window.localStorage.setItem(SUBMISSION_NOTIFICATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (private mode/quota/etc).
  }
};

const normalizeComparableText = (value) => String(value || "").trim().toLowerCase();
const normalizeEmailAddress = (value) => String(value || "").trim().toLowerCase();
const WHATSAPP_E164_INPUT_REGEX = /^\+\d{8,15}$/;
const normalizeWhatsAppE164Input = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  return `+${digits}`;
};
const isValidWhatsAppE164Input = (value) =>
  WHATSAPP_E164_INPUT_REGEX.test(normalizeWhatsAppE164Input(value));
const createDefaultWhatsAppSettingsDraft = (value = null) => {
  const source = value && typeof value === "object" ? value : {};
  const rawSendMode = String(source.send_mode || "text").trim().toLowerCase();
  const sendMode = ["text", "template", "auto"].includes(rawSendMode)
    ? rawSendMode
    : "text";
  return {
    enabled: source.enabled !== false,
    include_media: source.include_media !== false,
    use_template_fallback: source.use_template_fallback === true,
    send_mode: sendMode,
    template_name: String(source.template_name || "").trim(),
    template_language: String(source.template_language || "en_US").trim() || "en_US",
  };
};
const mergeUniqueSubmissionReasons = (...groups) => {
  const merged = [];
  const seen = new Set();

  for (const group of groups) {
    const values = Array.isArray(group) ? group : [];
    for (const value of values) {
      const reason = String(value || "").trim();
      if (!reason) {
        continue;
      }
      const key = reason.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(reason);
    }
  }

  return merged;
};

const matchesAdvertiserScope = (item, scope) => {
  if (!item || !scope) {
    return false;
  }

  const itemAdvertiserId = String(item.advertiser_id || "").trim();
  if (scope.id && itemAdvertiserId && itemAdvertiserId === scope.id) {
    return true;
  }

  const itemAdvertiserName = normalizeComparableText(
    item.advertiser_name || item.advertiser || "",
  );
  if (scope.name && itemAdvertiserName && itemAdvertiserName === scope.name) {
    return true;
  }

  const itemEmail = normalizeEmailAddress(item.email || item.contact_email || "");
  if (scope.email && itemEmail && itemEmail === scope.email) {
    return true;
  }

  return false;
};

const settingsTabs = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team" },
  { id: "notifications", label: "Notifications" },
  { id: "scheduling", label: "Ad Scheduling" },
  { id: "system", label: "System" },
];

const blankAd = {
  id: "",
  ad_name: "",
  advertiser_id: "",
  product_id: "",
  placement: "",
  post_type: "one_time",
  status: "Draft",
  payment: "Unpaid",
  payment_mode: "TBD",
  post_date: "",
  post_date_from: "",
  post_date_to: "",
  custom_dates: [],
  post_time: "",
  price: "",
  ad_text: "",
  media: [],
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
  credits: "0.00",
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
  items: [],
  contact_name: "",
  contact_email: "",
  bill_to: "",
  issue_date: "",
  discount: "0.00",
  tax: "0.00",
  total: "",
  amount_paid: "0.00",
  paid_via_credits: false,
  notes: "",
};

const createBlankInvoice = () => ({
  ...blankInvoice,
  issue_date: getTodayInAppTimeZone(),
});

const blankSubmissionEditForm = {
  advertiser_name: "",
  contact_name: "",
  email: "",
  phone_number: "",
  ad_name: "",
  post_type: "One-Time Post",
  post_date_from: "",
  post_date_to: "",
  custom_dates: [],
  post_time: "",
  reminder_minutes: 15,
  ad_text: "",
  media: [],
  placement: "",
  notes: "",
};

const toSubmissionEditForm = (item) => ({
  advertiser_name: item?.advertiser_name || "",
  contact_name: item?.contact_name || "",
  email: item?.email || "",
  phone_number: formatUSPhoneNumber(item?.phone_number || item?.phone || ""),
  ad_name: item?.ad_name || "",
  post_type: formatPostTypeLabel(item?.post_type || "one_time"),
  post_date_from: item?.post_date_from || item?.post_date || "",
  post_date_to: item?.post_date_to || "",
  custom_dates: Array.isArray(item?.custom_dates) ? item.custom_dates : [],
  post_time: String(item?.post_time || "").slice(0, 8),
  reminder_minutes: Number(item?.reminder_minutes) || 15,
  ad_text: item?.ad_text || "",
  media: Array.isArray(item?.media) ? item.media : [],
  placement: item?.placement || "",
  notes: item?.notes || "",
});

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

const roundCurrencyValue = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100) / 100;
};

const rebalanceInvoiceItemsToAmount = (items, targetAmount) => {
  const sourceItems = Array.isArray(items) ? items : [];
  if (sourceItems.length === 0) {
    return [];
  }

  const normalizedTarget = Math.max(roundCurrencyValue(targetAmount), 0);
  if (normalizedTarget <= 0) {
    return sourceItems.map((item) => ({
      ...item,
      amount: 0,
      unit_price: 0,
    }));
  }

  const currentSubtotal = sourceItems.reduce(
    (sum, item) => sum + (Number(item?.amount ?? item?.unit_price ?? 0) || 0),
    0,
  );

  let distributed = 0;
  return sourceItems.map((item, index) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    let nextAmount = 0;

    if (index === sourceItems.length - 1) {
      nextAmount = roundCurrencyValue(Math.max(normalizedTarget - distributed, 0));
    } else if (currentSubtotal > 0) {
      const baseAmount = Number(item?.amount ?? item?.unit_price ?? 0) || 0;
      nextAmount = roundCurrencyValue((baseAmount / currentSubtotal) * normalizedTarget);
    } else {
      nextAmount = roundCurrencyValue(normalizedTarget / sourceItems.length);
    }

    distributed = roundCurrencyValue(distributed + nextAmount);
    return {
      ...item,
      amount: nextAmount,
      unit_price: roundCurrencyValue(nextAmount / quantity),
    };
  });
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

const getInvoiceStatusLabel = (value) => {
  const normalizedStatus = normalizeInvoiceStatus(value);
  if (normalizedStatus === "Pending") {
    return "Ready for Payment";
  }
  return normalizedStatus;
};

const getInvoiceStatusPriority = (value) => {
  const status = normalizeInvoiceStatus(value);
  if (status === "Pending") {
    return 0;
  }
  if (status === "Paid") {
    return 2;
  }
  return 1;
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

const isInvoicePaidViaCredits = (invoice) => invoice?.paid_via_credits === true;

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
  return formatDateTimeInAppTimeZone(value, {
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

const ADS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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

const getAdsPublishedProgress = (adRecord) => {
  const occurrenceDateKeys = [...new Set(getAdOccurrenceDateKeys(adRecord))];
  if (occurrenceDateKeys.length <= 1) {
    return null;
  }

  const publishedDateSet = new Set(
    toStringArray(adRecord?.published_dates)
      .map((value) => toScheduleDateKey(value))
      .filter(Boolean),
  );

  let completed = occurrenceDateKeys.filter((dateKey) => publishedDateSet.has(dateKey)).length;
  const isPublishedStatus = String(adRecord?.status || "").trim().toLowerCase() === "published";

  // Legacy publish flows only set status to Published. Treat that as first completion for multi-date ads.
  if (completed === 0 && isPublishedStatus) {
    completed = 1;
  }

  if (completed <= 0) {
    return null;
  }

  return {
    completed: Math.min(completed, occurrenceDateKeys.length),
    total: occurrenceDateKeys.length,
  };
};

const getAdsStatusLabel = (adRecord) => {
  const progress = getAdsPublishedProgress(adRecord);
  if (progress) {
    return `${progress.completed} of ${progress.total} published`;
  }
  return adRecord?.status || "Draft";
};

const ADS_NON_ACTION_STATUSES = new Set([
  "published",
  "posted",
  "completed",
  "archived",
  "cancelled",
  "rejected",
  "failed",
]);

const ADS_STATUS_PRIORITY = new Map([
  ["approved", 0],
  ["scheduled", 1],
  ["draft", 2],
  ["pending", 3],
  ["queued", 4],
  ["in review", 5],
  ["review", 5],
  ["published", 10],
  ["posted", 11],
  ["completed", 12],
  ["archived", 13],
  ["cancelled", 14],
  ["rejected", 15],
  ["failed", 16],
]);

const normalizeAdsStatusForSort = (value) => String(value || "").trim().toLowerCase();

const isAdsActionRequired = (status) => {
  const normalizedStatus = normalizeAdsStatusForSort(status);
  if (!normalizedStatus) {
    return true;
  }
  return !ADS_NON_ACTION_STATUSES.has(normalizedStatus);
};

const getAdsStatusPriority = (status) => {
  const normalizedStatus = normalizeAdsStatusForSort(status);
  if (ADS_STATUS_PRIORITY.has(normalizedStatus)) {
    return ADS_STATUS_PRIORITY.get(normalizedStatus);
  }
  return ADS_NON_ACTION_STATUSES.has(normalizedStatus) ? 80 : 40;
};

const parseAdsTimeToMinutes = (value) => {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  const meridiem = String(match[3] || "").toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (hours === 12) {
      hours = 0;
    }
    if (meridiem === "PM") {
      hours += 12;
    }
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
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

const buildAdsShareMessage = (ad) =>
  String(ad?.ad_text || ad?.notes || "").trim();

const buildAdsTelegramCaption = (ad) =>
  String(ad?.ad_text || ad?.notes || "").trim();

const getAdMediaExtension = (value = "") => {
  const dotIndex = String(value || "").lastIndexOf(".");
  if (dotIndex < 0) return "";
  return String(value || "").slice(dotIndex).toLowerCase();
};

const resolveAdMediaType = (item) => {
  const declaredType = String(item?.type || "").trim().toLowerCase();
  if (["image", "video", "audio", "document"].includes(declaredType)) {
    return declaredType;
  }

  const mimeType = String(item?.mimeType || item?.mime_type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";

  const extension = getAdMediaExtension(item?.name || item?.url || item?.cdnUrl || "");
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".heic", ".heif"].includes(extension)) {
    return "image";
  }
  if ([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"].includes(extension)) {
    return "video";
  }
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac"].includes(extension)) {
    return "audio";
  }
  if (extension === ".pdf") {
    return "document";
  }
  return "file";
};

const getPrimaryAdsShareMedia = (ad) =>
  parseAdMedia(ad?.media).find((item) => {
    const type = resolveAdMediaType(item);
    const url = String(item?.url || item?.cdnUrl || "").trim();
    return url && (type === "image" || type === "video" || type === "audio" || type === "document");
  }) || null;

const getPrimaryAdsVisualMedia = (ad) =>
  parseAdMedia(ad?.media).find((item) => {
    const type = resolveAdMediaType(item);
    const url = String(item?.url || item?.cdnUrl || "").trim();
    return url && type === "image";
  }) || null;

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

function DashboardStatTooltipIcon({ icon: Icon, tooltip }) {
  return (
    <span className="inline-flex items-center justify-center">
      <span
        tabIndex={0}
        title={tooltip}
        aria-label={tooltip}
        className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300/70"
      >
        <Icon className="h-4 w-4" />
      </span>
    </span>
  );
}

function AdsScheduleCell({ ad }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const tooltipTriggerRef = useRef(null);
  const tooltipRef = useRef(null);

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
    return getTodayDateInAppTimeZone();
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

  useEffect(() => {
    if (!showTooltip || typeof window === "undefined") {
      return undefined;
    }

    const updateTooltipPosition = () => {
      if (!tooltipTriggerRef.current) {
        return;
      }

      const triggerRect = tooltipTriggerRef.current.getBoundingClientRect();
      const tooltipWidth = 256;
      const gap = 8;
      const viewportPadding = 12;
      const tooltipHeight = tooltipRef.current?.offsetHeight || 180;

      const left = Math.max(
        viewportPadding,
        Math.min(triggerRect.left, window.innerWidth - tooltipWidth - viewportPadding),
      );

      const top =
        triggerRect.bottom + gap + tooltipHeight <= window.innerHeight - viewportPadding
          ? triggerRect.bottom + gap
          : Math.max(viewportPadding, triggerRect.top - tooltipHeight - gap);

      setTooltipPosition({ top, left });
    };

    updateTooltipPosition();
    const animationFrameId = window.requestAnimationFrame(updateTooltipPosition);

    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [categorizedDates.length, showTooltip]);

  useEffect(() => {
    if (!showTooltip || typeof document === "undefined") {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (tooltipTriggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) {
        return;
      }
      setShowTooltip(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowTooltip(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showTooltip]);

  const handleTriggerMouseLeave = (event) => {
    if (tooltipRef.current?.contains(event.relatedTarget)) {
      return;
    }
    setShowTooltip(false);
  };

  const handleTooltipMouseLeave = (event) => {
    if (tooltipTriggerRef.current?.contains(event.relatedTarget)) {
      return;
    }
    setShowTooltip(false);
  };

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
      <button
        ref={tooltipTriggerRef}
        type="button"
        className="rounded-sm text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        onClick={(event) => {
          event.stopPropagation();
          setShowTooltip(true);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={handleTriggerMouseLeave}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={`View custom schedule details for ${ad.ad_name || "this ad"}`}
        aria-expanded={showTooltip}
        aria-haspopup="dialog"
      >
        <Info size={14} className="cursor-help" />
      </button>
      {showTooltip && typeof document !== "undefined"
        ? createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[220] w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3"
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={handleTooltipMouseLeave}
            role="dialog"
            aria-label="Custom schedule details"
          >
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
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

function AdsGridCard({
  ad,
  onPreview,
  onEdit,
  onMarkPublished,
  onDelete,
  onSendToWhatsApp,
  onSendToTelegram,
  readOnly = false,
  canDelete = false,
  isSelected = false,
  onToggleSelect,
}) {
  const [activeMenu, setActiveMenu] = useState(false);
  const [menuCoordinates, setMenuCoordinates] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setActiveMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!activeMenu) return undefined;
    const closeMenu = () => setActiveMenu(false);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [activeMenu]);

  const handleMenuClick = (event) => {
    event.stopPropagation();
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const hasPublishedAction = ad.status !== "Published";
    const menuActionCount = 4 + (hasPublishedAction ? 1 : 0) + (canDelete ? 1 : 0);
    const menuHeight = menuActionCount * 46 + (canDelete ? 10 : 0);
    const gap = 6;
    const viewportPadding = 8;
    
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - menuHeight - viewportPadding));
    
    let left = rect.right - menuWidth;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding));
    
    setMenuCoordinates({ top, left });
    setActiveMenu((current) => !current);
  };

  const imageMedia = getPrimaryAdsVisualMedia(ad);
  const imageUrl = imageMedia?.url || null;
  const statusLabel = getAdsStatusLabel(ad);

  return (
    <div 
      className={`relative flex flex-col gap-3 rounded-xl border bg-white p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] transition-all hover:border-gray-300 hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05),0_2px_4px_-1px_rgba(0,0,0,0.03)] ${isSelected ? "ring-2 ring-gray-900 border-transparent" : "border-gray-200"}`}
      onClick={() => onPreview(ad)}
      style={{ cursor: "pointer" }}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(ad.id)}
          className="absolute left-4 top-4 z-10 h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
        />
      )}

      {/* Image Area */}
      <div className="relative h-36 w-full overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100/50">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="text-gray-400 flex flex-col items-center justify-center gap-2">
            <LayoutGrid size={24} className="opacity-20" />
            <span className="text-xs font-medium opacity-50">No media</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-sm ${ad.status === 'Published' ? 'bg-emerald-50/95 text-emerald-700 border-emerald-200/50' : ad.status === 'Scheduled' ? 'bg-blue-50/95 text-blue-700 border-blue-200/50' : 'bg-white/95 text-gray-700 border-gray-200/50'}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1 px-1">
        <h4 className="truncate text-[13px] font-bold text-gray-900" title={ad.ad_name || ""}>
          {ad.ad_name || "Untitled Ad"}
        </h4>
        <div className="text-[11px] text-blue-600 truncate font-medium">
          {ad.advertiser || "No Advertiser"}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 font-medium flex items-center gap-1">
          {ad.placement || "N/A"}
        </div>
      </div>

      {/* Footer info splits */}
      <div className="grid grid-cols-2 gap-2 mt-auto text-[10px] text-gray-500 px-1 pt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-400">Schedule</span>
          <span className="font-medium text-gray-600 truncate">{ad.post_type || "-"}</span>
        </div>
        <div className="flex flex-col gap-0.5 items-end text-right">
          <span className="text-gray-400">{formatAdsDate(ad.post_date_from || ad.schedule || ad.post_date)}</span>
          <span className="font-medium text-gray-600">{formatAdsTime(ad.post_time)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2 px-1 pb-1">
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
            ad.payment === 'Paid' ? 'text-emerald-700' : 'text-gray-600'
          }`}
        >
          {ad.payment || "Pending"}
        </span>

        {/* Actions Menu */}
        <div className="relative">
          {readOnly ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview(ad);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-gray-200"
              type="button"
            >
              <Eye size={12} className="text-gray-500" />
              View
            </button>
          ) : (
            <>
              <button
                ref={menuButtonRef}
                onClick={handleMenuClick}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800 transition-colors shadow-sm"
                type="button"
              >
                <MoreVertical size={14} strokeWidth={2.5} />
              </button>
              {activeMenu && typeof document !== "undefined" ? createPortal(
                <div
                  ref={menuRef}
                  className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] z-[200] py-1"
                  style={{
                    top: `${menuCoordinates.top}px`,
                    left: `${menuCoordinates.left}px`,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setActiveMenu(false);
                      onPreview(ad);
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
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
                    className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    type="button"
                  >
                    <Pencil size={16} className="text-gray-400" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(false);
                      onSendToWhatsApp(ad);
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    type="button"
                  >
                    <MessageCircle size={16} className="text-green-500" />
                    Send to Admin WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(false);
                      onSendToTelegram(ad);
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    type="button"
                  >
                    <Send size={16} className="text-blue-500" />
                    Send to Telegram
                  </button>
                  {ad.status !== "Published" ? (
                    <button
                      onClick={() => {
                        setActiveMenu(false);
                        onMarkPublished(ad.id);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors border-t border-gray-50 mt-1"
                      type="button"
                    >
                      <CheckCircle size={16} className="text-gray-400" />
                      Mark as Published
                    </button>
                  ) : null}
                  {canDelete ? (
                    <>
                      <div className="border-t border-gray-50 my-1" />
                      <button
                        onClick={() => {
                          setActiveMenu(false);
                          onDelete(ad.id);
                        }}
                        className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                        type="button"
                      >
                        <Trash2 size={16} className="text-red-500" />
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>,
                document.body
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdsTableRow({
  ad,
  onPreview,
  onEdit,
  onMarkPublished,
  onDelete,
  onSendToWhatsApp,
  onSendToTelegram,
  readOnly = false,
  canDelete = false,
  isSelected = false,
  onToggleSelect,
}) {
  const [activeMenu, setActiveMenu] = useState(false);
  const [menuCoordinates, setMenuCoordinates] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        menuButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setActiveMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!activeMenu) {
      return undefined;
    }

    const closeMenu = () => setActiveMenu(false);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [activeMenu]);

  const handleMenuClick = (event) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const menuWidth = 192;
    const hasPublishedAction = ad.status !== "Published";
    const menuActionCount =
      4 + (hasPublishedAction ? 1 : 0) + (canDelete ? 1 : 0);
    const menuHeight =
      menuActionCount * 46 + (canDelete ? 10 : 0);
    const gap = 6;
    const viewportPadding = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - menuHeight - viewportPadding),
    );

    let left = rect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding),
    );

    setMenuCoordinates({ top, left });
    setActiveMenu((current) => !current);
  };

  const statusLabel = getAdsStatusLabel(ad);

  return (
    <tr className={`hover:bg-gray-50 transition-colors group${isSelected ? " bg-blue-50" : ""}`}>
      {onToggleSelect && (
        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(ad.id)}
            className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
          />
        </td>
      )}
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-semibold">{ad.invoice_number || "—"}</span>
      </td>
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
          {statusLabel}
        </span>
      </td>
      <td className="px-6 py-4 cursor-pointer" onClick={() => onPreview(ad)}>
        <span className="text-xs text-gray-700 font-medium">{ad.post_type || "-"}</span>
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
        {readOnly ? (
          <button
            onClick={() => onPreview(ad)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            type="button"
          >
            <Eye size={14} className="text-gray-400" />
            View
          </button>
        ) : (
          <>
            <button
              ref={menuButtonRef}
              onClick={handleMenuClick}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              type="button"
            >
              <MoreVertical size={18} className="text-gray-500" />
            </button>
            {activeMenu && typeof document !== "undefined"
              ? createPortal(
                <div
                  ref={menuRef}
                  className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[200] py-1"
                  style={{
                    top: `${menuCoordinates.top}px`,
                    left: `${menuCoordinates.left}px`,
                  }}
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
                  <button
                    onClick={() => {
                      setActiveMenu(false);
                      onSendToWhatsApp(ad);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    type="button"
                  >
                    <MessageCircle size={16} className="text-green-500" />
                    Send to Admin WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(false);
                      onSendToTelegram(ad);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    type="button"
                  >
                    <Send size={16} className="text-blue-500" />
                    Send to my Telegram
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
                  {canDelete ? (
                    <>
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
                    </>
                  ) : null}
                </div>,
                document.body,
              )
              : null}
          </>
        )}
      </td>
    </tr>
  );
}

function AdsPreviewModal({ ad, onClose, onEdit, linkedInvoices, canEdit = true }) {
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
  const today = getTodayDateInAppTimeZone();
  const media = parseAdMedia(ad.media);
  const statusLabel = getAdsStatusLabel(ad);

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
              {canEdit ? (
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
              ) : null}
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
                  {statusLabel}
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
                  {media.map((item, index) => {
                    const itemType = resolveAdMediaType(item);
                    const itemUrl = item?.url || item?.cdnUrl || "";
                    const itemName = item?.name || `Media ${index + 1}`;

                    return (
                      <div
                        key={`${itemUrl || itemName || "media"}-${index}`}
                        className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                      >
                        {itemType === "image" ? (
                          <img
                            src={itemUrl}
                            alt={itemName}
                            className="w-full h-full object-cover"
                          />
                        ) : itemType === "video" ? (
                          <div className="w-full h-full flex items-center justify-center bg-gray-900">
                            <Play size={48} className="text-white" />
                          </div>
                        ) : itemType === "audio" ? (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-100 text-gray-700 p-3 text-center">
                            <Volume2 size={28} />
                            <span className="text-[11px] font-medium line-clamp-2 break-words">
                              {itemName}
                            </span>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gray-100 text-gray-700 p-3 text-center">
                            <FileText size={28} />
                            <span className="text-[11px] font-medium line-clamp-2 break-words">
                              {itemName}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      const status = normalizeInvoiceStatus(invoiceItem.status);
                      const statusLabel = getInvoiceStatusLabel(status);
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
                                  {statusLabel}
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
  String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getSubmissionReasonPreview = (item) => {
  const status = String(item?.status || "").toLowerCase();
  const reviewNotes = String(item?.review_notes || "").trim();
  if (!reviewNotes) {
    return status === "not_approved" ? "No reason added" : "\u2014";
  }

  const lines = reviewNotes
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const bulletReason = lines.find((line) => line.startsWith("- "));
  if (bulletReason) {
    return bulletReason.slice(2);
  }

  const firstReadableLine = lines.find(
    (line) => !/^rejection reasons:?$/i.test(line) && !/^reviewer notes:?$/i.test(line),
  );
  return firstReadableLine || reviewNotes;
};

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

const normalizeAdvertiserStatus = (status) =>
  String(status || "active").trim().toLowerCase();

const isAdvertiserActiveStatus = (status) =>
  normalizeAdvertiserStatus(status) === "active";

const getAdvertiserStatusClass = (status) =>
  isAdvertiserActiveStatus(status)
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

const toDateKey = (date) => formatDateKeyFromDate(date);

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

const parseDateOnly = (value) => parseCalendarDate(value);

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

const toScheduleDateKey = (value) => {
  if (!value) {
    return "";
  }

  const raw =
    typeof value === "object" && value !== null
      ? value.date
      : value;
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }

  const parsed = parseDateOnly(text);
  if (parsed) {
    return formatDateKeyFromDate(parsed);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return "";
};

const normalizeCustomDateTimeValue = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  if (/^\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }
  const parsed = new Date(`1970-01-01T${text}`);
  if (Number.isNaN(parsed.valueOf())) {
    return "";
  }
  return parsed.toISOString().slice(11, 19);
};

const normalizeCustomDateReminderValue = (value, fallback = "15-min") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const normalizeCustomDateEntryForForm = (entry, { fallbackTime = "", fallbackReminder = "15-min" } = {}) => {
  const date = toScheduleDateKey(entry);
  if (!date) {
    return null;
  }

  if (entry && typeof entry === "object") {
    return {
      ...entry,
      date,
      time: normalizeCustomDateTimeValue(entry.time || entry.post_time || fallbackTime),
      reminder: normalizeCustomDateReminderValue(entry.reminder, fallbackReminder),
    };
  }

  return {
    date,
    time: normalizeCustomDateTimeValue(fallbackTime),
    reminder: normalizeCustomDateReminderValue("", fallbackReminder),
  };
};

const normalizeCustomDatesForForm = (value, options = {}) =>
  (Array.isArray(value) ? value : [])
    .map((entry) => normalizeCustomDateEntryForForm(entry, options))
    .filter(Boolean);

const expandScheduleDateKeys = (from, to) => {
  const startKey = toScheduleDateKey(from);
  const endKey = toScheduleDateKey(to || from);
  if (!startKey || !endKey) {
    return [];
  }

  const start = parseDateOnly(startKey);
  const end = parseDateOnly(endKey);
  if (!start || !end || end < start) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatDateKeyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const getAdOccurrenceDateKeys = (adRecord) => {
  const postType = normalizeCreateAdPostType(adRecord?.post_type || adRecord?.postType);
  if (postType === "Daily Run") {
    const expanded = expandScheduleDateKeys(
      adRecord?.post_date_from || adRecord?.postDateFrom || adRecord?.post_date || adRecord?.postDate,
      adRecord?.post_date_to || adRecord?.postDateTo,
    );
    if (expanded.length > 0) {
      return expanded;
    }
  }

  if (postType === "Custom Schedule") {
    const customDates = (Array.isArray(adRecord?.custom_dates)
      ? adRecord.custom_dates
      : Array.isArray(adRecord?.customDates)
        ? adRecord.customDates
        : [])
      .map((entry) => toScheduleDateKey(entry))
      .filter(Boolean);
    if (customDates.length > 0) {
      return [...new Set(customDates)];
    }
  }

  const singleDate = toScheduleDateKey(
    adRecord?.post_date_from ||
    adRecord?.postDateFrom ||
    adRecord?.post_date ||
    adRecord?.postDate ||
    adRecord?.schedule,
  );
  return singleDate ? [singleDate] : [];
};

const formatInvoiceOccurrenceDate = (dateKey) => {
  const parsed = parseDateOnly(dateKey);
  if (!parsed) {
    return dateKey;
  }
  return parsed.toLocaleDateString("en-US");
};

const buildInvoiceItemsFromAd = ({ adRecord, unitPrice = 0 } = {}) => {
  const safeUnitPrice = Number(unitPrice) || 0;
  const dateKeys = getAdOccurrenceDateKeys(adRecord);
  const adId = String(adRecord?.id || "").trim() || null;
  const productId = String(adRecord?.product_id || "").trim() || null;
  const baseDescription =
    adRecord?.product_name
      ? `${adRecord.product_name}${adRecord?.ad_name ? ` | Ad: ${adRecord.ad_name}` : ""}`
      : adRecord?.ad_name || "Advertising services";

  const toItem = (description) => ({
    id: createId(),
    invoice_id: null,
    ad_id: adId,
    product_id: productId,
    description,
    quantity: 1,
    unit_price: safeUnitPrice,
    amount: safeUnitPrice,
  });

  if (dateKeys.length <= 1) {
    return [toItem(baseDescription)];
  }

  return dateKeys.map((dateKey) =>
    toItem(`${baseDescription} - ${formatInvoiceOccurrenceDate(dateKey)}`),
  );
};

const toStringArray = (value) => {
  const toEntryText = (item) => {
    if (item && typeof item === "object") {
      if (Object.prototype.hasOwnProperty.call(item, "date")) {
        return String(item.date || "").trim();
      }
      if (Object.prototype.hasOwnProperty.call(item, "id")) {
        return String(item.id || "").trim();
      }
      return "";
    }
    return String(item || "").trim();
  };

  if (Array.isArray(value)) {
    return value.map((item) => toEntryText(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => toEntryText(item)).filter(Boolean);
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

  for (let i = 0; i < startingDayOfWeek; i += 1) {
    days.push({
      date: null,
      isPlaceholder: true,
    });
  }

  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push({
      date: new Date(year, month, i),
      isPlaceholder: false,
    });
  }

  const remainingDays = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remainingDays; i += 1) {
    days.push({
      date: null,
      isPlaceholder: true,
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

const sortCalendarItemsByTime = (items) =>
  [...items].sort((left, right) => {
    const leftTime = parseAdsTimeToMinutes(left?.ad?.post_time) ?? Number.MAX_SAFE_INTEGER;
    const rightTime = parseAdsTimeToMinutes(right?.ad?.post_time) ?? Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left?.ad?.ad_name || "").localeCompare(String(right?.ad?.ad_name || ""));
  });

const formatCalendarLiveTime = (value) => {
  const formatted = formatAdsTime(value);
  return formatted === "N/A" ? "Time TBD" : formatted;
};

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
          if (dayInfo.isPlaceholder || !dayInfo.date) {
            return (
              <div
                key={`placeholder-${year}-${month}-${index}`}
                className="min-h-[120px] border-b border-r border-gray-200 bg-white"
              />
            );
          }

          const dayAds = getAdsForDate(ads, dayInfo.date);
          const capacity = getCapacityStatus(dayAds.length, maxAdsPerDay);
          const today = toDateKey(dayInfo.date) === getTodayInAppTimeZone();

          return (
            <div
              key={`${toDateKey(dayInfo.date)}-${index}`}
              onClick={() => onDateClick(dayInfo.date)}
              className="min-h-[120px] border-b border-r border-gray-200 p-2 cursor-pointer hover:bg-gray-50 transition-colors bg-white"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-sm font-medium ${today
                    ? "bg-gray-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    : "text-gray-900"
                    }`}
                >
                  {dayInfo.date.getDate()}
                </span>

                {dayAds.length > 0 ? (
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
          const dayAds = sortCalendarItemsByTime(getAdsForDate(ads, date));
          const today = toDateKey(date) === getTodayInAppTimeZone();

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
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                        {formatCalendarLiveTime(item.ad.post_time)}
                      </span>
                    </div>
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
  const dayAds = sortCalendarItemsByTime(getAdsForDate(ads, currentDate));

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
              className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 items-start"
            >
              <div className="pt-3 text-right">
                <div className="text-xs font-semibold text-gray-700">
                  {formatCalendarLiveTime(item.ad.post_time)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">
                  Live
                </div>
              </div>
              <div
                onClick={() => onAdClick(item.ad)}
                className={`p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${getCalendarStatusColor(
                  item.ad.status,
                )}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base">{item.ad.ad_name}</h3>
                    <p className="text-sm opacity-75 mt-1">{item.ad.advertiser}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs">
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
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-white bg-opacity-50 shrink-0">
                    {item.ad.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarAdPreviewModal({ ad, onClose, onEdit, canEdit = true }) {
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
        {canEdit ? (
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Edit Ad
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdsPage() {
  const navigate = useNavigate();
  const authRedirectInFlightRef = useRef(false);
  const [db, setDb] = useState(() => readDb());
  const [revealedPii, setRevealedPii] = useState({});

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

  const toggleReveal = (id, e) => {
    if (e) e.stopPropagation();
    setRevealedPii((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [pendingAdDeleteIds, setPendingAdDeleteIds] = useState([]);
  const [selectedAdIds, setSelectedAdIds] = useState(new Set());
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window === "undefined") {
      return "Dashboard";
    }
    const value = new URLSearchParams(window.location.search).get("section");
    return sections.includes(value) ? value : "Dashboard";
  });
  const [view, setView] = useState("list");
  const [adsViewMode, setAdsViewMode] = useState("grid");
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
    key: null,
    direction: "asc",
  });
  const [adsPageSize, setAdsPageSize] = useState(10);
  const [adsCurrentPage, setAdsCurrentPage] = useState(1);
  const [adsPreviewAd, setAdsPreviewAd] = useState(null);
  const [calendarSearch, setCalendarSearch] = useState("");
  const [calendarMode, setCalendarMode] = useState("month");
  const [calendarCurrentDate, setCalendarCurrentDate] = useState(() =>
    getTodayDateInAppTimeZone(),
  );
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
  const [advertisersPageSize, setAdvertisersPageSize] = useState(10);
  const [advertisersCurrentPage, setAdvertisersCurrentPage] = useState(1);
  const [openAdvertiserMenuId, setOpenAdvertiserMenuId] = useState(null);
  const [advertiserMenuCoordinates, setAdvertiserMenuCoordinates] = useState({
    top: 0,
    left: 0,
  });
  const [advertiserViewModal, setAdvertiserViewModal] = useState(null);
  const [advertiserEditModal, setAdvertiserEditModal] = useState(null);
  const [advertiserDeleteModal, setAdvertiserDeleteModal] = useState(null);
  const [advertiserActionLoading, setAdvertiserActionLoading] = useState(false);
  const [advertiserCreditsLoading, setAdvertiserCreditsLoading] = useState(false);
  const [advertiserCreditsForm, setAdvertiserCreditsForm] = useState({
    amount: "",
    reason: "",
  });
  const [advertiserCreateOpen, setAdvertiserCreateOpen] = useState(false);
  const [advertiserCreateSource, setAdvertiserCreateSource] = useState("advertisers");
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
  const [productMenuCoordinates, setProductMenuCoordinates] = useState({
    top: 0,
    left: 0,
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
  const [invoiceMenuCoordinates, setInvoiceMenuCoordinates] = useState({
    top: 0,
    left: 0,
  });
  const [showInvoiceCreateMenu, setShowInvoiceCreateMenu] = useState(false);
  const [billingComposerMode, setBillingComposerMode] = useState("invoice");
  const [invoicePreviewModal, setInvoicePreviewModal] = useState(null);
  const [submissionEditModal, setSubmissionEditModal] = useState(null);
  const [submissionEditForm, setSubmissionEditForm] = useState(blankSubmissionEditForm);
  const [submissionEditCustomDate, setSubmissionEditCustomDate] = useState("");
  const [submissionEditCustomTime, setSubmissionEditCustomTime] = useState("");
  const [submissionEditLoading, setSubmissionEditLoading] = useState(false);
  const [submissionEditAvailabilityError, setSubmissionEditAvailabilityError] =
    useState(null);
  const [submissionEditCheckingAvailability, setSubmissionEditCheckingAvailability] =
    useState(false);
  const [submissionEditPastTimeError, setSubmissionEditPastTimeError] = useState(null);
  const [submissionEditFullyBookedDates, setSubmissionEditFullyBookedDates] = useState([]);
  const [submissionReviewAction, setSubmissionReviewAction] = useState("");
  const [submissionRejectReasonLibrary, setSubmissionRejectReasonLibrary] = useState(
    DEFAULT_SUBMISSION_REJECTION_REASONS,
  );
  const [submissionRejectSelectedReasons, setSubmissionRejectSelectedReasons] = useState([]);
  const [submissionRejectNote, setSubmissionRejectNote] = useState("");
  const [submissionRejectNewReason, setSubmissionRejectNewReason] = useState("");
  const submissionEditFormRef = useRef(blankSubmissionEditForm);
  const submissionEditAvailabilityRequestIdRef = useRef(0);
  const [adDeleteModal, setAdDeleteModal] = useState(null);
  const [invoiceDeleteModal, setInvoiceDeleteModal] = useState(null);
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [adsUnreadCount, setAdsUnreadCount] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pendingAdDeleteIdsRef = useRef(new Set());
  const pendingInvoiceActionIdsRef = useRef(new Set());
  const dropdownRef = useRef(null);
  const notificationsDropdownRef = useRef(null);
  const advertiserMenuRef = useRef(null);
  const productMenuRef = useRef(null);
  const invoiceMenuRef = useRef(null);
  const invoiceCreateMenuRef = useRef(null);
  const adsAdvancedFiltersRef = useRef(null);

  const [ad, setAd] = useState(blankAd);
  const [createAdCustomDate, setCreateAdCustomDate] = useState("");
  const [createAdCustomTime, setCreateAdCustomTime] = useState("");
  const [createAdAvailabilityError, setCreateAdAvailabilityError] = useState(null);
  const [createAdCheckingAvailability, setCreateAdCheckingAvailability] = useState(false);
  const [createAdFullyBookedDates, setCreateAdFullyBookedDates] = useState([]);
  const createAdStateRef = useRef(blankAd);
  const createAdAvailabilityRequestIdRef = useRef(0);
  const [createAdSubmitting, setCreateAdSubmitting] = useState(false);
  const [createAdSubmitMode, setCreateAdSubmitMode] = useState("");
  const [createAdErrors, setCreateAdErrors] = useState({});
  const [product, setProduct] = useState(blankProduct);
  const [invoice, setInvoice] = useState(() => createBlankInvoice());
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceCreditsApplying, setInvoiceCreditsApplying] = useState(false);
  const [pendingInvoiceActionIds, setPendingInvoiceActionIds] = useState([]);
  const [settingsActiveTab, setSettingsActiveTab] = useState("profile");
  const [settingsProfileName, setSettingsProfileName] = useState("");
  const [settingsProfileImage, setSettingsProfileImage] = useState("");
  const [settingsProfileWhatsapp, setSettingsProfileWhatsapp] = useState("");
  const [settingsProfileSaving, setSettingsProfileSaving] = useState(false);
  const [settingsProfileUploading, setSettingsProfileUploading] = useState(false);
  const [settingsProfileMessage, setSettingsProfileMessage] = useState(null);
  const [settingsTeamModalOpen, setSettingsTeamModalOpen] = useState(false);
  const [settingsTeamViewMode, setSettingsTeamViewMode] = useState("grid");
  const [settingsTeamName, setSettingsTeamName] = useState("");
  const [settingsTeamEmail, setSettingsTeamEmail] = useState("");
  const [settingsTeamRole, setSettingsTeamRole] = useState("staff");
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
  const [settingsNotificationWhatsAppTesting, setSettingsNotificationWhatsAppTesting] =
    useState(false);
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
  const [whatsAppAdminTab, setWhatsAppAdminTab] = useState("inbox");
  const [whatsAppNewRecipientLabel, setWhatsAppNewRecipientLabel] = useState("");
  const [whatsAppNewRecipientPhone, setWhatsAppNewRecipientPhone] = useState("");
  const [whatsAppRecipientAdding, setWhatsAppRecipientAdding] = useState(false);
  const [whatsAppRecipientTesting, setWhatsAppRecipientTesting] = useState(null);
  const [whatsAppSettingsDraft, setWhatsAppSettingsDraft] = useState(
    createDefaultWhatsAppSettingsDraft(),
  );
  const [whatsAppSettingsSaving, setWhatsAppSettingsSaving] = useState(false);
  const [whatsAppBulkTesting, setWhatsAppBulkTesting] = useState(false);

  const userRole = normalizeAppRole(user?.role);
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const isStaff = userRole === "staff";
  const isAdvertiser = userRole === "advertiser";
  const isInternalUserRole = isInternalRole(userRole);
  const allowedSections = getVisibleSectionsForRole(userRole);
  const canViewBilling = can(userRole, "billing:view");
  const canEditBilling = can(userRole, "billing:edit");
  const canViewSettings = can(userRole, "settings:view");
  const canDeleteAds = can(userRole, "ads:delete");
  const canEditAds = can(userRole, "ads:edit");
  const canViewAdvertisers = can(userRole, "advertisers:view");
  const canEditAdvertisers = can(userRole, "advertisers:edit");
  const canViewProducts = can(userRole, "products:view");
  const canEditProducts = can(userRole, "products:edit");
  const canViewReconciliation = can(userRole, "reconciliation:view");
  const canConvertSubmissions = can(userRole, "submissions:convert");
  const canRejectSubmissions = can(userRole, "submissions:reject");
  const canBatchDeleteSubmissions = isAdmin || isManager;
  const canViewNotifications = can(userRole, "notifications:view");

  const refreshPendingSubmissions = async () => {
    try {
      const response = await fetchWithSessionAuth("/api/admin/pending-ads/list", {
        cache: "no-store",
      });
      if (response?.ok) {
        const data = await response.json();
        const pendingAds = Array.isArray(data?.pending_ads) ? data.pending_ads : [];
        setDb((current) => ({
          ...(current || readDb()),
          pending_ads: pendingAds,
        }));
        return;
      }
    } catch (error) {
      console.error("[AdsPage] Failed to fetch pending submissions via API:", error);
    }

    try {
      invalidateDbCache();
      await ensureDb();
      setDb(readDb());
    } catch (error) {
      console.error("[AdsPage] Failed to refresh submissions after notification:", error);
    }
  };

  const openSubmissionsFromNotification = async () => {
    setShowNotificationsDropdown(false);
    setActiveSection("Submissions");
    setView("list");

    try {
      await refreshPendingSubmissions();
      window.setTimeout(() => {
        void refreshPendingSubmissions();
      }, 1500);
    } catch (error) {
      console.error(
        "[AdsPage] Failed to refresh submissions after notification:",
        error,
      );
    }
  };

  const { unreadCount, markAllAsRead } = useSubmissionNotifications(canViewNotifications, {
    onViewPending: async () => {
      await openSubmissionsFromNotification();
    },
  });
  const totalUnreadCount = unreadCount + adsUnreadCount;

  useEffect(() => {
    if (!ready || activeSection !== "Submissions" || !canViewNotifications) {
      return undefined;
    }

    void refreshPendingSubmissions();

    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void refreshPendingSubmissions();
    }, 10_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeSection, canViewNotifications, ready]);

  useEffect(() => {
    createAdStateRef.current = ad;
  }, [ad]);

  useEffect(() => {
    const applySignal = (signal) => {
      const source = String(signal?.source || "").trim().toLowerCase();
      if (source !== ADMIN_CREATED_AD_NOTIFICATION_SOURCE) {
        return;
      }
      setAdsUnreadCount((current) => current + 1);
    };

    const handleSignalEvent = (event) => {
      applySignal(parseNotificationSignal(event?.detail));
    };

    const handleStorage = (event) => {
      if (event.key === SUBMISSION_NOTIFICATION_STORAGE_KEY && event.newValue) {
        applySignal(parseNotificationSignal(event.newValue));
      }
    };

    window.addEventListener(SUBMISSION_NOTIFICATION_EVENT, handleSignalEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(SUBMISSION_NOTIFICATION_EVENT, handleSignalEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    submissionEditFormRef.current = submissionEditForm;
  }, [submissionEditForm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(SUBMISSION_REJECTION_REASON_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setSubmissionRejectReasonLibrary(
        mergeUniqueSubmissionReasons(DEFAULT_SUBMISSION_REJECTION_REASONS, parsed),
      );
    } catch (error) {
      console.error("Failed to load submission rejection reasons:", error);
    }
  }, []);

  useEffect(() => {
    if (!settingsProfileMessage) {
      return;
    }

    const payload = {
      title:
        settingsProfileMessage.type === "success"
          ? "Profile updated"
          : "Unable to save profile",
      description: settingsProfileMessage.text,
    };

    if (settingsProfileMessage.type === "success") {
      appToast.success(payload);
      return;
    }

    appToast.error(payload);
  }, [settingsProfileMessage]);

  useEffect(() => {
    if (settingsActiveTab === "billing") {
      setSettingsActiveTab("profile");
    }
  }, [settingsActiveTab]);

  useEffect(() => {
    if (!settingsNotificationMessage) {
      return;
    }

    const payload = {
      title:
        settingsNotificationMessage.type === "success"
          ? "Notifications updated"
          : settingsNotificationMessage.type === "info"
            ? "Notification check complete"
            : "Unable to update notifications",
      description: settingsNotificationMessage.text,
    };

    if (settingsNotificationMessage.type === "success") {
      appToast.success(payload);
      return;
    }

    if (settingsNotificationMessage.type === "info") {
      appToast.info(payload);
      return;
    }

    appToast.error(payload);
  }, [settingsNotificationMessage]);

  useEffect(() => {
    if (!settingsSchedulingError) {
      return;
    }

    appToast.error({
      title: "Unable to save scheduling settings",
      description: settingsSchedulingError,
    });
  }, [settingsSchedulingError]);

  useEffect(() => {
    if (!settingsSchedulingSuccess) {
      return;
    }

    appToast.success({
      title: "Scheduling settings updated",
      description: "Maximum ads per day was saved successfully.",
    });
  }, [settingsSchedulingSuccess]);

  useEffect(() => {
    if (!settingsTeamError) {
      return;
    }

    appToast.error({
      title: "Unable to update team",
      description: settingsTeamError,
    });
  }, [settingsTeamError]);


  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const redirectToSignIn = () => {
      if (cancelled || authRedirectInFlightRef.current) {
        return;
      }
      authRedirectInFlightRef.current = true;
      navigate("/account/signin", { replace: true });
    };
    const sync = () => {
      if (cancelled) {
        return;
      }
      setDb(readDb());
      setUser(getSignedInUser());
      setReady(true);
    };

    const recoverSessionUser = async () => {
      const recovered = await resolveSupabaseSessionUser();
      if (recovered?.id) {
        return recovered;
      }
      try {
        const supabase = getSupabaseClient();
        await supabase.auth.refreshSession();
      } catch {
        // Ignore refresh failures and fall through to the final session lookup.
      }
      return resolveSupabaseSessionUser();
    };

    const initialize = async () => {
      if (hasSupabaseConfig) {
        try {
          const recoveredUser = await recoverSessionUser();
          if (cancelled) {
            return;
          }

          if (!recoveredUser) {
            const fallbackUser = getSignedInUser();
            if (!fallbackUser?.id) {
              await signOut();
              redirectToSignIn();
              return;
            }
          } else {
            const cachedUser = getSignedInUser();
            const cachedUserId = String(cachedUser?.id || "").trim();
            const recoveredUserId = String(recoveredUser.id || "").trim();
            if (!cachedUserId || cachedUserId !== recoveredUserId) {
              invalidateDbCache();
            }
          }
        } catch (error) {
          console.error("Failed to validate Supabase session:", error);
          const fallbackUser = getSignedInUser();
          if (!fallbackUser?.id) {
            await signOut();
            redirectToSignIn();
            return;
          }
        }
      }

      invalidateDbCache();
      await ensureDb();
      if (!cancelled) {
        sync();
        unsubscribe = subscribeDb(sync);
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!ready || user || hasSupabaseConfig) {
      return;
    }

    navigate("/account/signin", { replace: true });
  }, [navigate, ready, user]);

  useEffect(() => {
    if (!ready || !user) {
      return;
    }

    if (!allowedSections.includes(activeSection)) {
      setActiveSection(allowedSections[0] || "Dashboard");
      setView("list");
      return;
    }

    if (isAdvertiser && (view === "createAd" || view === "newInvoice")) {
      setView("list");
      setAd(blankAd);
      setInvoice(createBlankInvoice());
      setShowInvoiceCreateMenu(false);
      setOpenInvoiceMenuId(null);
    }
  }, [activeSection, allowedSections, isAdvertiser, ready, user, view]);

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
      if (
        notificationsDropdownRef.current &&
        !notificationsDropdownRef.current.contains(event.target)
      ) {
        setShowNotificationsDropdown(false);
      }
    };

    if (!showProfileDropdown && !showNotificationsDropdown) {
      return undefined;
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showNotificationsDropdown, showProfileDropdown]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const advertiserMenuTrigger = event.target?.closest?.("[data-advertiser-menu-trigger='true']");
      if (
        advertiserMenuRef.current &&
        !advertiserMenuRef.current.contains(event.target) &&
        !advertiserMenuTrigger
      ) {
        setOpenAdvertiserMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!openAdvertiserMenuId) {
      return undefined;
    }

    const closeMenu = () => setOpenAdvertiserMenuId(null);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openAdvertiserMenuId]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const productMenuTrigger = event.target?.closest?.("[data-product-menu-trigger='true']");
      if (
        productMenuRef.current &&
        !productMenuRef.current.contains(event.target) &&
        !productMenuTrigger
      ) {
        setOpenProductMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!openProductMenuId) {
      return undefined;
    }

    const closeMenu = () => setOpenProductMenuId(null);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openProductMenuId]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const invoiceMenuTrigger = event.target?.closest?.("[data-invoice-menu-trigger='true']");
      if (
        invoiceMenuRef.current &&
        !invoiceMenuRef.current.contains(event.target) &&
        !invoiceMenuTrigger
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
    if (!openInvoiceMenuId) {
      return undefined;
    }

    const closeMenu = () => setOpenInvoiceMenuId(null);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openInvoiceMenuId]);

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

  const allAdvertisers = db.advertisers || [];
  const products = db.products || [];
  const allAds = db.ads || [];
  const allPending = db.pending_ads || [];
  const allInvoices = db.invoices || [];
  const teamMembers = db.team_members || [];
  const isInvoiceActionPending = (invoiceId) =>
    pendingInvoiceActionIds.includes(String(invoiceId || "").trim());
  const adminSettings = db.admin_settings || {};
  const notificationPreferences = db.notification_preferences || {};
  const currentAdvertiser = useMemo(() => {
    if (!isAdvertiser) {
      return null;
    }

    const advertiserId = String(user?.advertiser_id || "").trim();
    if (advertiserId) {
      const byId = allAdvertisers.find((item) => String(item.id || "").trim() === advertiserId);
      if (byId) {
        return byId;
      }
    }

    const email = normalizeEmailAddress(user?.email);
    if (email) {
      const byEmail = allAdvertisers.find(
        (item) => normalizeEmailAddress(item.email) === email,
      );
      if (byEmail) {
        return byEmail;
      }
    }

    const advertiserName = normalizeComparableText(user?.advertiser_name);
    if (advertiserName) {
      return (
        allAdvertisers.find(
          (item) => normalizeComparableText(item.advertiser_name) === advertiserName,
        ) || null
      );
    }

    return null;
  }, [
    allAdvertisers,
    isAdvertiser,
    user?.advertiser_id,
    user?.advertiser_name,
    user?.email,
  ]);
  const advertiserScope = useMemo(() => {
    if (!isAdvertiser) {
      return null;
    }

    const id = String(currentAdvertiser?.id || user?.advertiser_id || "").trim();
    const name = normalizeComparableText(
      currentAdvertiser?.advertiser_name || user?.advertiser_name,
    );
    const email = normalizeEmailAddress(currentAdvertiser?.email || user?.email);

    if (!id && !name && !email) {
      return null;
    }

    return { id, name, email };
  }, [
    currentAdvertiser?.advertiser_name,
    currentAdvertiser?.email,
    currentAdvertiser?.id,
    isAdvertiser,
    user?.advertiser_id,
    user?.advertiser_name,
    user?.email,
  ]);
  const advertisers = useMemo(() => {
    if (!isAdvertiser) {
      return allAdvertisers;
    }
    if (!advertiserScope) {
      return [];
    }
    return allAdvertisers.filter((item) => matchesAdvertiserScope(item, advertiserScope));
  }, [advertiserScope, allAdvertisers, isAdvertiser]);
  const ads = useMemo(() => {
    if (!isAdvertiser) {
      return allAds;
    }
    if (!advertiserScope) {
      return [];
    }
    return allAds.filter((item) => matchesAdvertiserScope(item, advertiserScope));
  }, [advertiserScope, allAds, isAdvertiser]);
  const pending = useMemo(() => {
    if (!isAdvertiser) {
      return allPending;
    }
    if (!advertiserScope) {
      return [];
    }
    return allPending.filter((item) => matchesAdvertiserScope(item, advertiserScope));
  }, [advertiserScope, allPending, isAdvertiser]);
  const invoices = useMemo(() => {
    if (!isAdvertiser) {
      return allInvoices;
    }
    if (!advertiserScope) {
      return [];
    }
    return allInvoices.filter((item) => matchesAdvertiserScope(item, advertiserScope));
  }, [advertiserScope, allInvoices, isAdvertiser]);
  const settingsTelegramChatIds = Array.isArray(db.telegram_chat_ids)
    ? db.telegram_chat_ids
    : [];
  const settingsActiveTelegramCount = settingsTelegramChatIds.filter(
    (item) => item.is_active !== false,
  ).length;
  const whatsAppRecipients = useMemo(() => {
    const source = Array.isArray(notificationPreferences.whatsapp_recipients)
      ? notificationPreferences.whatsapp_recipients
      : [];
    return [...source].sort((a, b) => {
      const aActive = a?.is_active !== false ? 1 : 0;
      const bActive = b?.is_active !== false ? 1 : 0;
      if (aActive !== bActive) {
        return bActive - aActive;
      }
      return String(a?.label || a?.phone_e164 || "")
        .toLowerCase()
        .localeCompare(String(b?.label || b?.phone_e164 || "").toLowerCase());
    });
  }, [notificationPreferences.whatsapp_recipients]);
  const whatsAppActiveRecipientCount = useMemo(
    () => whatsAppRecipients.filter((entry) => entry?.is_active !== false).length,
    [whatsAppRecipients],
  );
  const whatsAppPersistedSettings = useMemo(
    () => createDefaultWhatsAppSettingsDraft(notificationPreferences.whatsapp_settings),
    [notificationPreferences.whatsapp_settings],
  );
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
    setSettingsProfileWhatsapp(formatUSPhoneNumber(user?.whatsapp_number || ""));
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
        notificationPreferences.telegram_enabled ??
        (settingsActiveTelegramCount > 0 ? true : current.telegram_enabled ?? false),
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
        formatUSPhoneNumber(notificationPreferences.phone_number || current.phone_number || ""),
      sound_enabled:
        notificationPreferences.sound_enabled ?? current.sound_enabled ?? true,
    }));
    setSettingsMaxAdsPerDay(
      String(adminSettings.max_ads_per_day || adminSettings.max_ads_per_slot || 5),
    );
  }, [adminSettings, notificationPreferences, settingsActiveTelegramCount, user?.email]);

  useEffect(() => {
    setWhatsAppSettingsDraft(
      createDefaultWhatsAppSettingsDraft(notificationPreferences.whatsapp_settings),
    );
  }, [notificationPreferences.whatsapp_settings, user?.id]);

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
    return ads.filter(
      (item) => String(item.advertiser_id || "") === String(invoice.advertiser_id || ""),
    );
  }, [ads, invoice.advertiser_id]);

  const selectedInvoiceAdvertiser = useMemo(
    () =>
      advertisers.find(
        (item) => String(item.id || "") === String(invoice.advertiser_id || ""),
      ) || null,
    [advertisers, invoice.advertiser_id],
  );

  const invoicePreviewStatus = useMemo(
    () => normalizeInvoiceStatus(invoice.status),
    [invoice.status],
  );

  const invoicePreviewLinkedAds = useMemo(
    () =>
      (
        Array.isArray(invoice.items) && invoice.items.length > 0
          ? invoice.items.map((item) => item.ad_id).filter(Boolean)
          : Array.isArray(invoice.ad_ids)
            ? invoice.ad_ids
            : []
      )
        .map((adId) => ads.find((item) => String(item.id) === String(adId)))
        .filter(Boolean),
    [ads, invoice.ad_ids, invoice.items],
  );

  const isCreditComposer = billingComposerMode === "credit";

  const invoicePreviewItems = useMemo(() => {
    if (isCreditComposer) {
      return [
        {
          key: "credit-top-up",
          title: "Prepaid credit top-up",
          detail:
            String(invoice.notes || "").trim() ||
            "Credits will be added to the advertiser balance.",
          amount: Number(invoice.amount || invoice.total || 0) || 0,
        },
      ];
    }

    const invoiceItems = Array.isArray(invoice.items) ? invoice.items : [];
    if (invoiceItems.length > 0) {
      return invoiceItems.map((item, index) => ({
        key: String(item?.id || item?.ad_id || index),
        title: item?.description || "Advertising services",
        detail: "",
        amount: Number(item?.amount ?? item?.unit_price ?? 0) || 0,
      }));
    }

    if (invoicePreviewLinkedAds.length > 0) {
      return invoicePreviewLinkedAds.flatMap((linkedAd, adIndex) => {
        const linkedUnitPrice = Number(linkedAd?.price || 0) || 0;
        return buildInvoiceItemsFromAd({
          adRecord: linkedAd,
          unitPrice: linkedUnitPrice,
        }).map((item, itemIndex) => ({
          key: `${linkedAd?.id || adIndex}-${itemIndex}`,
          title: item.description || linkedAd?.ad_name || "Advertising services",
          detail: linkedAd?.placement || "",
          amount: Number(item.amount ?? item.unit_price ?? linkedUnitPrice) || 0,
        }));
      });
    }

    return [
      {
        key: "empty",
        title: selectedInvoiceAdvertiser?.advertiser_name || "Advertising services",
        detail: "No ads selected yet",
        amount: Number(invoice.amount || invoice.total || 0) || 0,
      },
    ];
  }, [
    isCreditComposer,
    invoice.items,
    invoice.amount,
    invoice.total,
    invoice.notes,
    invoicePreviewLinkedAds,
    selectedInvoiceAdvertiser?.advertiser_name,
  ]);

  const invoicePreviewSubtotal = useMemo(
    () => invoicePreviewItems.reduce((sum, item) => sum + (Number(item?.amount) || 0), 0),
    [invoicePreviewItems],
  );

  const invoicePreviewDiscount = useMemo(
    () => Number(invoice.discount || 0) || 0,
    [invoice.discount],
  );

  const invoicePreviewTax = useMemo(
    () => Number(invoice.tax || 0) || 0,
    [invoice.tax],
  );

  const invoicePreviewAmount = useMemo(
    () => Math.max(0, invoicePreviewSubtotal - invoicePreviewDiscount + invoicePreviewTax),
    [invoicePreviewDiscount, invoicePreviewSubtotal, invoicePreviewTax],
  );
  const selectedAdvertiserCredits = Number(selectedInvoiceAdvertiser?.credits ?? 0) || 0;
  const creditsCoverInvoiceTotal =
    !isCreditComposer && invoicePreviewAmount > 0 && selectedAdvertiserCredits >= invoicePreviewAmount;
  const canApplyCreditsToInvoice =
    !isCreditComposer &&
    Boolean(String(invoice?.id || "").trim()) &&
    !isInvoicePaidViaCredits(invoice) &&
    invoicePreviewStatus === "Pending" &&
    creditsCoverInvoiceTotal;
  const dashboardStats = useMemo(() => {
    const now = getTodayDateInAppTimeZone();
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
      pendingSubmissions: pending.filter(
        (item) => String(item?.status || "").toLowerCase() === "pending",
      ).length,
      activeAdvertisers: advertisers.length,
      paidRevenue,
      outstandingRevenue,
      monthRevenue,
      overdueInvoices: invoices.filter((item) => item.status === "Overdue")
        .length,
    };
  }, [ads, advertisers.length, invoices, pending]);

  const invoicePreviewDetails = useMemo(() => {
    if (!invoicePreviewModal) {
      return null;
    }

    const advertiser =
      advertisers.find(
        (item) =>
          String(item.id || "") === String(invoicePreviewModal.advertiser_id || ""),
      ) || null;
    const status = normalizeInvoiceStatus(invoicePreviewModal.status);
    const invoiceNumber = invoicePreviewModal.invoice_number || invoicePreviewModal.id || "";
    const issueDate = formatInvoiceListDate(
      invoicePreviewModal.issue_date ||
      invoicePreviewModal.due_date ||
      invoicePreviewModal.created_at,
    );
    const invoiceItems = Array.isArray(invoicePreviewModal.items) ? invoicePreviewModal.items : [];
    const linkedAds = (
      invoiceItems.length > 0
        ? invoiceItems.map((item) => item.ad_id).filter(Boolean)
        : Array.isArray(invoicePreviewModal.ad_ids)
          ? invoicePreviewModal.ad_ids
          : []
    )
      .map((adId) => ads.find((item) => String(item.id) === String(adId)))
      .filter(Boolean);
    const total = Number(invoicePreviewModal.total || invoicePreviewModal.amount || 0) || 0;
    const primaryDescription =
      invoiceItems.length === 1
        ? invoiceItems[0].description || "Advertising services"
        : linkedAds.length === 1
          ? linkedAds[0].product_name
            ? `${linkedAds[0].product_name}${linkedAds[0].ad_name ? ` | Ad: ${linkedAds[0].ad_name}` : ""}`
            : linkedAds[0].ad_name || "Advertising services"
          : linkedAds.length > 1
            ? `${Math.max(invoiceItems.length, linkedAds.length)} linked ads`
            : advertiser?.advertiser_name || invoicePreviewModal.advertiser_name || "Advertising services";
    const attentionLine =
      invoicePreviewModal.contact_name ||
      advertiser?.contact_name ||
      advertiser?.email ||
      invoicePreviewModal.advertiser_name ||
      "";
    const contactEmail =
      invoicePreviewModal.contact_email || advertiser?.email || "";

    return {
      advertiser,
      status,
      paidViaCredits: isInvoicePaidViaCredits(invoicePreviewModal),
      invoiceNumber,
      issueDate,
      linkedAds,
      items: invoiceItems,
      total,
      primaryDescription,
      attentionLine,
      contactEmail,
    };
  }, [ads, advertisers, invoicePreviewModal]);

  const buildInvoicePreviewDocument = (details) => {
    if (!details) {
      return "";
    }

    const escapeHtml = (value) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const badgeClass =
      details.status === "Paid"
        ? "color:#047857;background:#ecfdf5;border:1px solid #d1fae5;"
        : details.status === "Pending"
          ? "color:#b45309;background:#fffbeb;border:1px solid #fde68a;"
          : "color:#be123c;background:#fff1f2;border:1px solid #fecdd3;";

    const invoiceLogoHtml = `
      <img 
        src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" 
        alt="CBN Unfiltered Logo" 
        style="display:block;margin-bottom:12px;height:48px;width:auto;" 
      />
    `;

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${escapeHtml(details.invoiceNumber)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 32px; color: #111827; }
      .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; max-width: 580px; margin: 0 auto; padding: 32px; }
      .row { display: flex; justify-content: space-between; gap: 24px; }
      .muted { color: #6b7280; font-size: 12px; }
      .title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
      .company { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
      .big { font-size: 20px; font-weight: 700; }
      .section { padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; }
      .badge { display:inline-flex; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; ${badgeClass} }
      .line { display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #f3f4f6; }
      .totals { display:flex; justify-content:space-between; margin:8px 0; font-size:14px; }
      .total-final { display:flex; justify-content:space-between; margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb; font-size:16px; font-weight:700; }
      .footer { text-align:center; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="section row">
        <div>
          ${invoiceLogoHtml}

          <div class="company">${escapeHtml(INVOICE_COMPANY_NAME)}</div>
          <div class="muted">${escapeHtml(INVOICE_COMPANY_ADDRESS)}</div>
          <div class="muted">${escapeHtml(INVOICE_COMPANY_EMAIL)}</div>
        </div>
        <div style="text-align:right;">
          <div class="muted">#${escapeHtml(details.invoiceNumber)}</div>
          <div style="margin-top:8px;"><span class="badge">${escapeHtml(
            getInvoiceStatusLabel(details.status).toUpperCase(),
          )}</span></div>
          ${details.paidViaCredits ? '<div style="margin-top:8px;"><span class="badge" style="background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8;">PAID VIA CREDITS</span></div>' : ""}
        </div>
      </div>
      <div class="section row">
        <div>
          <div class="muted" style="font-weight:700;text-transform:uppercase;">Bill to</div>
          <div class="title">${escapeHtml(details.advertiser?.advertiser_name || details.attentionLine || "-")}</div>
          ${details.attentionLine ? `<div class="muted">Attn: ${escapeHtml(details.attentionLine)}</div>` : ""}
          ${details.contactEmail ? `<div class="muted">${escapeHtml(details.contactEmail)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="margin-bottom:12px;">
            <div class="muted" style="font-weight:700;text-transform:uppercase;">Issue Date</div>
            <div class="title">${escapeHtml(details.issueDate || "-")}</div>
          </div>
          <div>
            <div class="muted" style="font-weight:700;text-transform:uppercase;">Amount Due</div>
            <div class="big">${escapeHtml(formatCurrency(details.total))}</div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="row muted" style="font-weight:700;text-transform:uppercase;">
          <div>Description</div>
          <div>Amount</div>
        </div>
        <div class="line">
          <div class="title">${escapeHtml(details.primaryDescription)}</div>
          <div class="title">${escapeHtml(formatCurrency(details.total))}</div>
        </div>
      </div>
      <div class="section">
        <div class="totals"><div class="muted" style="font-size:14px;">Subtotal</div><div class="title">${escapeHtml(formatCurrency(details.total))}</div></div>
        <div class="total-final"><div>Total</div><div>${escapeHtml(formatCurrency(details.total))}</div></div>
      </div>
      <div class="footer">
        <div class="title">Thank you for your business</div>
        <div class="muted">${details.paidViaCredits
          ? "This invoice was fully covered by prepaid credits. No transfer is required."
          : `Please include invoice #${escapeHtml(details.invoiceNumber)} in transfer description.`}</div>
      </div>
    </div>
  </body>
</html>`;
  };

  const printInvoicePreview = () => {
    if (!invoicePreviewDetails) {
      return;
    }

    const invoiceDocumentHtml = buildInvoicePreviewDocument(invoicePreviewDetails);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    let printStarted = false;

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 250);
    };

    iframe.onload = () => {
      if (printStarted) {
        return;
      }
      printStarted = true;

      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        cleanup();
        appToast.error({
          title: "Print unavailable",
          description: "Could not open the invoice preview for printing.",
        });
        return;
      }

      iframeWindow.focus();
      iframeWindow.onafterprint = cleanup;
      window.setTimeout(() => {
        try {
          iframeWindow.print();
        } catch {
          cleanup();
          appToast.error({
            title: "Print unavailable",
            description: "The browser blocked the print dialog.",
          });
        }
      }, 150);
    };

    iframe.srcdoc = invoiceDocumentHtml;
    document.body.appendChild(iframe);
  };

  const downloadInvoicePreview = () => {
    if (!invoicePreviewDetails) {
      return;
    }

    download(
      `invoice-${invoicePreviewDetails.invoiceNumber}.html`,
      buildInvoicePreviewDocument(invoicePreviewDetails),
      "text/html;charset=utf-8",
    );
  };

  const upcomingAds = useMemo(() => {
    const today = getTodayDateInAppTimeZone();
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
    const now = getTodayDateInAppTimeZone();
    const sevenDaysFromNow = new Date(now);
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
    setCalendarCurrentDate(getTodayDateInAppTimeZone());
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
    const invoiceNumberByInvoiceId = new Map(
      invoices
        .filter((item) => item?.id)
        .map((item) => [String(item.id), String(item.invoice_number || "").trim()]),
    );
    const invoiceNumberByAdId = new Map();
    for (const invoiceItem of invoices) {
      const invoiceNumber = String(invoiceItem?.invoice_number || "").trim();
      if (!invoiceNumber) {
        continue;
      }
      const linkedAdIds = toStringArray(invoiceItem?.ad_ids)
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      for (const linkedAdId of linkedAdIds) {
        if (!invoiceNumberByAdId.has(linkedAdId)) {
          invoiceNumberByAdId.set(linkedAdId, invoiceNumber);
        }
      }
    }

    const todayKey = getTodayInAppTimeZone();

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
      const normalizedInvoiceId = String(
        item.paid_via_invoice_id || item.invoice_id || "",
      ).trim();
      const invoiceNumber = String(
        item.invoice_number ||
          (normalizedInvoiceId ? invoiceNumberByInvoiceId.get(normalizedInvoiceId) : "") ||
          invoiceNumberByAdId.get(String(item.id || "").trim()) ||
          "",
      ).trim();

      return {
        ...item,
        advertiser: advertiserName,
        placement,
        status,
        payment_raw: paymentRaw || "Unpaid",
        payment,
        post_type: normalizeCalendarPostType(item.post_type),
        invoice_number: invoiceNumber,
        schedule,
        custom_dates: customDates,
        published_dates: publishedDates,
      };
    });
  }, [ads, advertisers, invoices, products]);

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

  const pendingAdDeleteIdSet = useMemo(
    () => new Set(pendingAdDeleteIds),
    [pendingAdDeleteIds],
  );

  const filteredAds = useMemo(() => {
    const query = String(adsFilters.search || "").toLowerCase().trim();
    const today = getTodayDateInAppTimeZone();
    const weekStart = getWeekStart(today);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return adsNormalized.filter((item) => {
      if (pendingAdDeleteIdSet.has(String(item.id || ""))) {
        return false;
      }

      const adName = String(item.ad_name || "").toLowerCase();
      const advertiser = String(item.advertiser || "").toLowerCase();
      const placement = String(item.placement || "").toLowerCase();
      const invoiceNumber = String(item.invoice_number || "").toLowerCase();

      if (
        query &&
        !adName.includes(query) &&
        !advertiser.includes(query) &&
        !placement.includes(query) &&
        !invoiceNumber.includes(query)
      ) {
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
  }, [adsFilters, adsNormalized, pendingAdDeleteIdSet]);

  const sortedAds = useMemo(() => {
    if (!adsSortConfig.key) {
      const todayKey = getTodayInAppTimeZone();

      return [...filteredAds].sort((left, right) => {
        const leftDate = parseCalendarDate(left.schedule);
        const rightDate = parseCalendarDate(right.schedule);
        const leftDateKey = leftDate ? toDateKey(leftDate) : null;
        const rightDateKey = rightDate ? toDateKey(rightDate) : null;

        // Groups: 0 = today, 1 = future, 2 = past, 3 = no date
        const dateGroup = (dateKey) =>
          dateKey === todayKey ? 0 : dateKey > todayKey ? 1 : dateKey ? 2 : 3;
        const leftGroup = dateGroup(leftDateKey);
        const rightGroup = dateGroup(rightDateKey);

        if (leftGroup !== rightGroup) return leftGroup - rightGroup;

        if (leftGroup <= 1) {
          // Today or future: sort by date asc, then time asc (soonest first)
          const leftDateVal = leftDate?.valueOf() ?? Infinity;
          const rightDateVal = rightDate?.valueOf() ?? Infinity;
          if (leftDateVal !== rightDateVal) return leftDateVal - rightDateVal;

          const leftTime = parseAdsTimeToMinutes(left.post_time) ?? Infinity;
          const rightTime = parseAdsTimeToMinutes(right.post_time) ?? Infinity;
          if (leftTime !== rightTime) return leftTime - rightTime;
        } else if (leftGroup === 2) {
          // Past: most recent first
          const leftDateVal = leftDate?.valueOf() ?? 0;
          const rightDateVal = rightDate?.valueOf() ?? 0;
          if (leftDateVal !== rightDateVal) return rightDateVal - leftDateVal;

          const leftTime = parseAdsTimeToMinutes(left.post_time) ?? -1;
          const rightTime = parseAdsTimeToMinutes(right.post_time) ?? -1;
          if (leftTime !== rightTime) return rightTime - leftTime;
        }

        return String(left.ad_name || "").localeCompare(String(right.ad_name || ""));
      });
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
        leftValue = parseAdsTimeToMinutes(leftValue) ?? -1;
        rightValue = parseAdsTimeToMinutes(rightValue) ?? -1;
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

  useEffect(() => {
    setAdsCurrentPage(1);
    setSelectedAdIds(new Set());
  }, [adsFilters, adsSortConfig]);

  const adsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedAds.length / adsPageSize)),
    [adsPageSize, sortedAds.length],
  );

  useEffect(() => {
    setAdsCurrentPage((current) => Math.min(Math.max(current, 1), adsTotalPages));
  }, [adsTotalPages]);

  const paginatedAds = useMemo(() => {
    const startIndex = (adsCurrentPage - 1) * adsPageSize;
    return sortedAds.slice(startIndex, startIndex + adsPageSize);
  }, [adsCurrentPage, adsPageSize, sortedAds]);

  const adsPageStartIndex =
    sortedAds.length === 0 ? 0 : (adsCurrentPage - 1) * adsPageSize + 1;
  const adsPageEndIndex = Math.min(adsCurrentPage * adsPageSize, sortedAds.length);

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
    const todayText = getTodayInAppTimeZone();
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

    const start = getTodayDateInAppTimeZone();
    const dayMap = new Map();
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = toDateKey(date);
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
    const now = getTodayDateInAppTimeZone();
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const minMonth = new Date(
      REVENUE_TREND_MIN_MONTH.year,
      REVENUE_TREND_MIN_MONTH.monthIndex,
      1,
    );

    if (endMonth < minMonth) {
      return points;
    }

    const rollingStartMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - 5, 1);
    const startMonth = rollingStartMonth < minMonth ? minMonth : rollingStartMonth;
    const monthCount =
      (endMonth.getFullYear() - startMonth.getFullYear()) * 12 +
      (endMonth.getMonth() - startMonth.getMonth()) +
      1;

    for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(endMonth.getFullYear(), endMonth.getMonth() - offset, 1);
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

  const filteredPendingSubmissions = useMemo(
    () =>
      pending.filter((item) =>
        ["pending", "not_approved"].includes(String(item.status || "").toLowerCase()),
      ),
    [pending],
  );

  useEffect(() => {
    if (!canBatchDeleteSubmissions) {
      setSelectedSubmissionIds(new Set());
      return;
    }

    const visibleIds = new Set(
      filteredPendingSubmissions.map((item) => String(item.id || "").trim()).filter(Boolean),
    );

    setSelectedSubmissionIds((current) => {
      if (current.size === 0) {
        return current;
      }
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [canBatchDeleteSubmissions, filteredPendingSubmissions]);

  const filteredAdvertisers = useMemo(() => {
    const filtered = advertisers.filter((item) => {
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

    const sortByName = (left, right) =>
      String(left?.advertiser_name || "").localeCompare(
        String(right?.advertiser_name || ""),
        "en",
        { sensitivity: "base" },
      );

    const activeAdvertisers = [];
    const inactiveAdvertisers = [];

    filtered.forEach((item) => {
      if (isAdvertiserActiveStatus(item?.status)) {
        activeAdvertisers.push(item);
        return;
      }
      inactiveAdvertisers.push(item);
    });

    activeAdvertisers.sort(sortByName);
    inactiveAdvertisers.sort(sortByName);

    return [...activeAdvertisers, ...inactiveAdvertisers];
  }, [advertiserSearch, advertisers]);

  const advertiserTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredAdvertisers.length / advertisersPageSize)),
    [advertisersPageSize, filteredAdvertisers.length],
  );

  useEffect(() => {
    setAdvertisersCurrentPage(1);
  }, [advertiserSearch]);

  useEffect(() => {
    setAdvertisersCurrentPage((current) =>
      Math.min(Math.max(current, 1), advertiserTotalPages),
    );
  }, [advertiserTotalPages]);

  useEffect(() => {
    setOpenAdvertiserMenuId(null);
  }, [advertiserSearch, advertisersCurrentPage, advertisersPageSize]);

  const paginatedAdvertisers = useMemo(() => {
    const startIndex = (advertisersCurrentPage - 1) * advertisersPageSize;
    return filteredAdvertisers.slice(startIndex, startIndex + advertisersPageSize);
  }, [advertisersCurrentPage, advertisersPageSize, filteredAdvertisers]);

  const advertiserPageStartIndex =
    filteredAdvertisers.length === 0 ? 0 : (advertisersCurrentPage - 1) * advertisersPageSize + 1;
  const advertiserPageEndIndex = Math.min(
    advertisersCurrentPage * advertisersPageSize,
    filteredAdvertisers.length,
  );

  const filteredProducts = useMemo(() => products, [products]);

  const filteredInvoices = useMemo(() => {
    const baseFiltered = invoices.filter((item) => {
      const normalizedStatus = normalizeInvoiceStatus(item.status);
      const statusLabel = getInvoiceStatusLabel(normalizedStatus);
      const advertiserName =
        item.advertiser_name ||
        advertisers.find(
          (adv) => String(adv.id || "") === String(item.advertiser_id || ""),
        )?.advertiser_name ||
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
        String(statusLabel || "").toLowerCase().includes(query) ||
        String(advertiserName || "").toLowerCase().includes(query)
      );
    });

    const sorted = [...baseFiltered].sort((a, b) => {
      const statusPriorityDiff =
        getInvoiceStatusPriority(a.status) - getInvoiceStatusPriority(b.status);
      if (statusPriorityDiff !== 0) {
        return statusPriorityDiff;
      }

      if (!invoiceSortConfig.key || !invoiceSortConfig.direction) {
        const aDefaultDate = new Date(a.due_date || a.created_at || 0).valueOf();
        const bDefaultDate = new Date(b.due_date || b.created_at || 0).valueOf();
        if (aDefaultDate !== bDefaultDate) {
          return bDefaultDate - aDefaultDate;
        }
        return String(a.id || "").localeCompare(String(b.id || ""));
      }

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

      const aDate = new Date(a.due_date || a.created_at || 0).valueOf();
      const bDate = new Date(b.due_date || b.created_at || 0).valueOf();
      if (aDate !== bDate) {
        return bDate - aDate;
      }

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    return sorted;
  }, [advertisers, invoiceFilters, invoices, invoiceSortConfig]);

  const invoiceSummary = useMemo(() => {
      const summary = invoices.reduce(
        (acc, item) => {
          const total = Number(item.total ?? item.amount ?? 0) || 0;
          const amountPaid = Number(item.amount_paid ?? 0) || 0;
          const outstanding = Math.max(total - amountPaid, 0);
          const status = normalizeInvoiceStatus(item.status);
        if (status === "Paid") {
          acc.totalPaid += amountPaid || total;
        }
        if (status === "Partial") {
          acc.totalPaid += amountPaid;
          acc.totalOutstanding += outstanding;
        }
        if (status === "Pending" || status === "Overdue") {
          acc.totalOutstanding += outstanding || total;
        }
          if (status === "Overdue") {
            acc.overdueCount += 1;
          }
          return acc;
        },
        { totalOutstanding: 0, totalPaid: 0, overdueCount: 0 },
      );
      const totalCredits = advertisers.reduce((sum, advertiser) => {
        const credits = Number(advertiser?.credits ?? 0) || 0;
        if (credits <= 0) return sum;
        return sum + credits;
      }, 0);

      return {
        ...summary,
        totalCredits,
      };
    }, [advertisers, invoices]);

  const reconciliation = useMemo(() => getReconciliationReport(), [db]);

  const run = async (fn, successText) => {
    try {
      await fn();
      setDb(readDb());
      if (successText) {
        appToast.success({
          title: successText,
        });
      }
    } catch (error) {
      console.error("[AdsPage] Action failed", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Action failed",
      });
    }
  };

  const refreshDbFromSupabase = async () => {
    if (!hasSupabaseConfig) {
      const nextDb = readDb();
      setDb(nextDb);
      return nextDb;
    }

    invalidateDbCache();
    await ensureDb();
    const nextDb = readDb();
    setDb(nextDb);
    return nextDb;
  };

  const handleAdvertiserSubmissionCreated = async () => {
    await refreshDbFromSupabase();
    setActiveSection("Submissions");
    setView("list");
  };

  const handleRejectPendingAd = async (pendingAdId, { reasons = [], note = "" } = {}) => {
    const normalizedPendingAdId = String(pendingAdId || "").trim();
    if (!normalizedPendingAdId) {
      return false;
    }

    const normalizedReasons = mergeUniqueSubmissionReasons(reasons);
    const normalizedNote = String(note || "").trim();

    if (!hasSupabaseConfig) {
      try {
        await rejectPendingAd(normalizedPendingAdId, {
          reasons: normalizedReasons,
          note: normalizedNote,
        });
        setDb(readDb());
        appToast.success({
          title: "Submission rejected.",
        });
        return true;
      } catch (error) {
        console.error("[AdsPage] Reject submission failed", error);
        appToast.error({
          title: error instanceof Error ? error.message : "Failed to reject submission.",
        });
        return false;
      }
    }

    try {
      const response = await fetchWithSessionAuth("/api/admin/pending-ads/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pending_ad_id: normalizedPendingAdId,
          reasons: normalizedReasons,
          rejection_note: normalizedNote,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to reject submission.");
      }

      invalidateDbCache();
      await ensureDb();
      setDb(readDb());
      appToast.success({
        title: "Submission rejected.",
      });
      return true;
    } catch (error) {
      console.error("[AdsPage] Reject submission failed", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to reject submission.",
      });
      return false;
    }
  };

  const handleDeletePendingSubmission = async (pendingAdId) => {
    const normalizedPendingAdId = String(pendingAdId || "").trim();
    if (!normalizedPendingAdId) {
      return false;
    }

    try {
      await deletePendingAd(normalizedPendingAdId);
      setDb(readDb());
      appToast.success({
        title: "Submission deleted.",
      });
      return true;
    } catch (error) {
      console.error("[AdsPage] Delete submission failed", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to delete submission.",
      });
      return false;
    }
  };

  const handleToggleSelectSubmission = (pendingAdId) => {
    const normalizedPendingAdId = String(pendingAdId || "").trim();
    if (!normalizedPendingAdId || !canBatchDeleteSubmissions) {
      return;
    }
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      next.has(normalizedPendingAdId)
        ? next.delete(normalizedPendingAdId)
        : next.add(normalizedPendingAdId);
      return next;
    });
  };

  const handleSelectAllSubmissions = () => {
    if (!canBatchDeleteSubmissions) {
      return;
    }

    const allIds = filteredPendingSubmissions
      .map((item) => String(item.id || "").trim())
      .filter(Boolean);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSubmissionIds.has(id));
    setSelectedSubmissionIds(allSelected ? new Set() : new Set(allIds));
  };

  const executeBatchDeleteSubmissions = async (submissionIds) => {
    if (!canBatchDeleteSubmissions) {
      appToast.error({ title: "You do not have permission to delete submissions." });
      return;
    }

    const ids = Array.from(
      new Set(
        (Array.isArray(submissionIds) ? submissionIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    );
    if (ids.length === 0) {
      return;
    }

    const toastId = "batch-delete-submissions";
    appToast.info({
      id: toastId,
      title: "Deleting submissions...",
      duration: Infinity,
    });

    let deletedCount = 0;
    let failedCount = 0;

    try {
      for (const pendingAdId of ids) {
        try {
          await deletePendingAd(pendingAdId);
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          console.error("[AdsPage] Batch delete submission failed", {
            pendingAdId,
            error,
          });
        }
      }

      setDb(readDb());
      setSelectedSubmissionIds(new Set());

      if (failedCount === 0) {
        appToast.success({
          title: `Deleted ${deletedCount} submission${deletedCount === 1 ? "" : "s"}.`,
        });
      } else if (deletedCount > 0) {
        appToast.warning({
          title: "Batch delete partially completed.",
          description: `${deletedCount} deleted, ${failedCount} failed.`,
        });
      } else {
        appToast.error({
          title: "Failed to delete submissions.",
        });
      }
    } finally {
      appToast.dismiss(toastId);
    }
  };

  const handleBatchDeleteSubmissions = () => {
    if (!canBatchDeleteSubmissions || selectedSubmissionIds.size === 0) {
      return;
    }

    const ids = [...selectedSubmissionIds];
    appToast.warning({
      id: "confirm-batch-delete-submissions",
      title: `Delete ${ids.length} submission${ids.length > 1 ? "s" : ""}?`,
      description: "This cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => {
          void executeBatchDeleteSubmissions(ids);
        },
      },
    });
  };

  const handleModalApprovePendingAd = async () => {
    if (!submissionEditModal?.id || submissionEditLoading) {
      return;
    }
    setSubmissionEditLoading(true);
    try {
      const currentForm = submissionEditFormRef.current;
      const advertiserId = resolveSubmissionAdvertiserId({
        submission: submissionEditModal,
        form: currentForm,
      });
      if (!advertiserId) {
        appToast.error({
          title: "Approval needs advertiser mapping",
          description: "Match this submission to an advertiser record before approving.",
        });
        return;
      }

      const productId = resolveSubmissionProductId({
        submission: submissionEditModal,
        form: currentForm,
      });
      if (!productId) {
        appToast.error({
          title: "Approval needs a product package",
          description: "Create at least one product package, then approve again.",
        });
        return;
      }

      const normalizedPostType = normalizeCreateAdPostType(currentForm.post_type);
      const placement =
        String(currentForm.placement || submissionEditModal.placement || "").trim() || "Standard";
      const conversionPayload = {
        advertiser_id: advertiserId,
        placement,
        product_id: productId,
        post_type: toCreateAdPostTypeValue(normalizedPostType),
        schedule: buildSubmissionApprovalSchedule(currentForm),
        ad_name: String(currentForm.ad_name || "").trim(),
        ad_text: String(currentForm.ad_text || "").trim(),
        notes: String(currentForm.notes || "").trim(),
        media: Array.isArray(currentForm.media) ? currentForm.media : [],
        billingAction: "stay_on_ads",
      };

      const response = await fetchWithSessionAuth(
        `/api/submissions/${submissionEditModal.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...currentForm,
            custom_dates: currentForm.custom_dates,
            post_time:
              currentForm.post_time && currentForm.post_time.length === 5
                ? `${currentForm.post_time}:00`
                : currentForm.post_time,
          }),
        },
      );
      const updateData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(updateData?.error || "Failed to save submission details before approval.");
      }

      const convertResponse = await fetchWithSessionAuth(
        `/api/submissions/${submissionEditModal.id}/convert`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(conversionPayload),
        },
      );

      const convertData = await convertResponse.json().catch(() => ({}));
      if (!convertResponse.ok) {
        throw new Error(convertData?.error || "Failed to convert submission.");
      }

      invalidateDbCache();
      await ensureDb();
      setDb(readDb());

      const convertedAd = convertData?.ad || null;
      resetSubmissionEditState();
      if (convertedAd?.id) {
        setActiveSection("Ads");
        openAdEditor(convertedAd);
      }

      appToast.success({
        title: "Submission moved to Ad Editor.",
        description:
          "Finalize product and invoice details there before sending ready-for-payment notifications.",
      });
    } catch (error) {
      console.error("Failed to approve submission:", error);
      appToast.error({
        title:
          error instanceof Error
            ? error.message
            : "Failed to move submission to Ad Editor.",
      });
    } finally {
      setSubmissionEditLoading(false);
    }
  };

  const handleModalRejectPendingAd = async () => {
    if (!submissionEditModal?.id || submissionEditLoading) {
      return;
    }

    const selectedReasons = mergeUniqueSubmissionReasons(submissionRejectSelectedReasons);
    const reviewerNote = String(submissionRejectNote || "").trim();
    if (selectedReasons.length === 0 && !reviewerNote) {
      appToast.error({
        title: "Add rejection feedback",
        description: "Select at least one reason or provide a reviewer note.",
      });
      return;
    }

    setSubmissionEditLoading(true);
    try {
      const rejected = await handleRejectPendingAd(submissionEditModal.id, {
        reasons: selectedReasons,
        note: reviewerNote,
      });
      if (rejected) {
        resetSubmissionEditState();
      }
    } finally {
      setSubmissionEditLoading(false);
    }
  };

  const handleModalDeletePendingSubmission = async () => {
    if (!submissionEditModal?.id || submissionEditLoading) {
      return;
    }
    setSubmissionEditLoading(true);
    try {
      const deleted = await handleDeletePendingSubmission(submissionEditModal.id);
      if (deleted) {
        resetSubmissionEditState();
      }
    } finally {
      setSubmissionEditLoading(false);
    }
  };

  const submitSubmissionReviewAction = async () => {
    if (!isSubmissionReviewMode || !submissionReviewAction || submissionEditLoading) {
      return;
    }

    if (submissionReviewAction === "approve") {
      await handleModalApprovePendingAd();
      return;
    }
    if (submissionReviewAction === "reject") {
      await handleModalRejectPendingAd();
      return;
    }
    if (submissionReviewAction === "delete") {
      await handleModalDeletePendingSubmission();
    }
  };

  const fetchWithSessionAuth = async (input, init = {}) => {
    if (!hasSupabaseConfig) {
      return fetch(input, init);
    }

    const supabase = getSupabaseClient();
    let {
      data: { session },
    } = await supabase.auth.getSession();

    const expiresAtMs = Number(session?.expires_at || 0) * 1000;
    const needsRefresh =
      !session?.access_token ||
      (Number.isFinite(expiresAtMs) &&
        expiresAtMs > 0 &&
        expiresAtMs <= Date.now() + 60_000);

    if (needsRefresh) {
      const { data: refreshData } = await supabase.auth.refreshSession();
      session = refreshData?.session || session || null;
    }

    const accessToken = String(session?.access_token || "").trim();
    if (!accessToken) {
      return fetch(input, init);
    }

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status !== 401) {
      return response;
    }

    const { data: refreshData } = await supabase.auth.refreshSession();
    const refreshedToken = String(refreshData?.session?.access_token || "").trim();
    if (!refreshedToken || refreshedToken === accessToken) {
      return response;
    }

    const retryHeaders = new Headers(init.headers || {});
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);

    return fetch(input, {
      ...init,
      headers: retryHeaders,
    });
  };

  const ensureAdvertiserAccountInvite = async (advertiserId) => {
    if (!isAdmin || !hasSupabaseConfig) {
      return { skipped: true };
    }

    const normalizedAdvertiserId = String(advertiserId || "").trim();
    if (!normalizedAdvertiserId) {
      return { skipped: true };
    }

    const advertiserRecord = advertisers.find(
      (item) => String(item?.id || "").trim() === normalizedAdvertiserId,
    );
    const advertiserEmail = String(advertiserRecord?.email || "")
      .trim()
      .toLowerCase();

    if (!advertiserEmail) {
      return { skipped: true, reason: "missing_email" };
    }

    try {
      const response = await fetchWithSessionAuth("/api/admin/advertisers/ensure-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: normalizedAdvertiserId,
          advertiser_name: advertiserRecord?.advertiser_name || "",
          contact_name: advertiserRecord?.contact_name || "",
          email: advertiserEmail,
          phone_number: advertiserRecord?.phone_number || advertiserRecord?.phone || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          skipped: false,
          error: data?.error || "Failed to send advertiser account email.",
        };
      }

      return data || { skipped: false };
    } catch (error) {
      return {
        skipped: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send advertiser account email.",
      };
    }
  };

  const sendApprovedAdNoticeEmail = async ({ adRecord, advertiserId }) => {
    if (!isAdmin || !hasSupabaseConfig) {
      return { skipped: true };
    }

    const adId = String(adRecord?.id || "").trim();
    if (!adId) {
      return { skipped: true };
    }

    const normalizedAdvertiserId = String(
      advertiserId || adRecord?.advertiser_id || "",
    ).trim();
    const advertiserRecord = advertisers.find(
      (item) => String(item?.id || "").trim() === normalizedAdvertiserId,
    );

    const advertiserEmail = String(advertiserRecord?.email || "")
      .trim()
      .toLowerCase();
    if (!advertiserEmail) {
      return { skipped: true, reason: "missing_email" };
    }

    try {
      const response = await fetchWithSessionAuth("/api/admin/ads/send-approval-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ad_id: adId,
          advertiser_id: normalizedAdvertiserId || null,
          email: advertiserEmail,
          contact_name: advertiserRecord?.contact_name || "",
          invoice_id:
            adRecord?.paid_via_invoice_id || adRecord?.invoice_id || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return {
          skipped: false,
          error: data?.error || "Failed to send ready-for-payment email.",
        };
      }

      return data || { skipped: false };
    } catch (error) {
      return {
        skipped: false,
        error:
          error instanceof Error ? error.message : "Failed to send ready-for-payment email.",
      };
    }
  };

  const resolveInvoiceReminderAdRecord = (invoiceRecord) => {
    const normalizedInvoiceId = String(invoiceRecord?.id || "").trim();

    const candidateAdIds = [
      ...toStringArray(invoiceRecord?.ad_ids),
      ...(Array.isArray(invoiceRecord?.items)
        ? invoiceRecord.items
            .map((item) => String(item?.ad_id || "").trim())
            .filter(Boolean)
        : []),
      ...(normalizedInvoiceId
        ? ads
            .filter((item) => {
              const linkedInvoiceId = String(
                item?.paid_via_invoice_id || item?.invoice_id || "",
              ).trim();
              return linkedInvoiceId && linkedInvoiceId === normalizedInvoiceId;
            })
            .map((item) => String(item?.id || "").trim())
            .filter(Boolean)
        : []),
    ];

    const uniqueCandidateAdIds = [...new Set(candidateAdIds.filter(Boolean))];
    for (const candidateAdId of uniqueCandidateAdIds) {
      const matchedAd = ads.find(
        (item) => String(item?.id || "").trim() === candidateAdId,
      );
      if (matchedAd) {
        return matchedAd;
      }
    }

    const advertiserId = String(invoiceRecord?.advertiser_id || "").trim();
    if (advertiserId) {
      const fallbackAd = ads.find(
        (item) => String(item?.advertiser_id || "").trim() === advertiserId,
      );
      if (fallbackAd) {
        return fallbackAd;
      }
    }

    return null;
  };

  const sendReadyForPaymentReminder = async ({ invoiceRecord }) => {
    const normalizedInvoiceId = String(invoiceRecord?.id || "").trim();
    if (!normalizedInvoiceId) {
      return { skipped: true, reason: "missing_invoice" };
    }

    if (isInvoicePaidViaCredits(invoiceRecord)) {
      return { skipped: true, reason: "paid_via_credits" };
    }

    const resolvedAdRecord = resolveInvoiceReminderAdRecord(invoiceRecord);
    if (!resolvedAdRecord?.id) {
      return { skipped: true, reason: "missing_ad" };
    }

    return sendApprovedAdNoticeEmail({
      adRecord: {
        ...resolvedAdRecord,
        paid_via_invoice_id: normalizedInvoiceId,
        invoice_id: normalizedInvoiceId,
      },
      advertiserId:
        String(invoiceRecord?.advertiser_id || "").trim() ||
        String(resolvedAdRecord?.advertiser_id || "").trim(),
    });
  };

  const sendPaidInvoiceNotice = async ({ invoiceId }) => {
    if (!isAdmin || !hasSupabaseConfig) {
      return { skipped: true };
    }

    const normalizedInvoiceId = String(invoiceId || "").trim();
    if (!normalizedInvoiceId) {
      return { skipped: true };
    }

    try {
      const response = await fetchWithSessionAuth(
        "/api/admin/invoices/send-payment-received",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            invoice_id: normalizedInvoiceId,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.reason === "paid_via_credits") {
          return {
            ...data,
            skipped: true,
          };
        }
        return {
          skipped: false,
          error: data?.error || "Failed to send payment received notifications.",
        };
      }

      if (data?.advertiser_email_sent === false) {
        return {
          ...data,
          skipped: false,
          error: data?.advertiser_email_error || "Failed to send advertiser payment email.",
        };
      }

      return data || { skipped: false };
    } catch (error) {
      return {
        skipped: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send payment received notifications.",
      };
    }
  };

  const sendAdLifecycleNotification = async ({
    event = "updated",
    adRecord = null,
    fallbackPayload = null,
  } = {}) => {
    if (!isInternalUserRole || !hasSupabaseConfig) {
      return { skipped: true };
    }

    const adId = String(adRecord?.id || fallbackPayload?.id || "").trim();
    const payload = {
      event,
      ad_id: adId || null,
      ad_name:
        adRecord?.ad_name || fallbackPayload?.ad_name || "",
      advertiser_name:
        adRecord?.advertiser ||
        fallbackPayload?.advertiser ||
        fallbackPayload?.advertiser_name ||
        "",
      status: adRecord?.status || fallbackPayload?.status || "",
      post_type: adRecord?.post_type || fallbackPayload?.post_type || "",
      placement: adRecord?.placement || fallbackPayload?.placement || "",
      post_date_from:
        adRecord?.post_date_from ||
        fallbackPayload?.post_date_from ||
        fallbackPayload?.post_date ||
        "",
      post_date_to: adRecord?.post_date_to || fallbackPayload?.post_date_to || "",
      post_time: adRecord?.post_time || fallbackPayload?.post_time || "",
      actor_name: user?.name || "",
      actor_email: user?.email || "",
    };

    try {
      const response = await fetchWithSessionAuth("/api/admin/ads/internal-notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          skipped: false,
          error: data?.error || `Failed to send ${event} notification.`,
        };
      }
      return data || { skipped: false };
    } catch (error) {
      return {
        skipped: false,
        error:
          error instanceof Error
            ? error.message
            : `Failed to send ${event} notification.`,
      };
    }
  };

  const resetSubmissionEditState = () => {
    submissionEditFormRef.current = blankSubmissionEditForm;
    submissionEditAvailabilityRequestIdRef.current += 1;
    setSubmissionEditModal(null);
    setSubmissionEditForm(blankSubmissionEditForm);
    setSubmissionEditCustomDate("");
    setSubmissionEditCustomTime("");
    setSubmissionEditLoading(false);
    setSubmissionEditCheckingAvailability(false);
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditPastTimeError(null);
    setSubmissionEditFullyBookedDates([]);
    setSubmissionReviewAction("");
    setSubmissionRejectSelectedReasons([]);
    setSubmissionRejectNote("");
    setSubmissionRejectNewReason("");
  };

  const openSubmissionEditModal = (submission) => {
    const nextForm = toSubmissionEditForm(submission);
    const normalizedStatus = String(submission?.status || "").toLowerCase();
    let defaultReviewAction = "";
    if (["pending", "not_approved"].includes(normalizedStatus)) {
      if (canConvertSubmissions) {
        defaultReviewAction = "approve";
      } else if (canRejectSubmissions) {
        defaultReviewAction = "reject";
      } else if (canBatchDeleteSubmissions && normalizedStatus === "not_approved") {
        defaultReviewAction = "delete";
      }
    }

    submissionEditFormRef.current = nextForm;
    submissionEditAvailabilityRequestIdRef.current += 1;
    setSubmissionEditModal(submission);
    setSubmissionEditForm(nextForm);
    setSubmissionEditCustomDate("");
    setSubmissionEditCustomTime("");
    setSubmissionEditLoading(false);
    setSubmissionEditCheckingAvailability(false);
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditPastTimeError(null);
    setSubmissionEditFullyBookedDates([]);
    setSubmissionReviewAction(defaultReviewAction);
    setSubmissionRejectSelectedReasons([]);
    setSubmissionRejectNote("");
    setSubmissionRejectNewReason("");
  };

  const resolveSubmissionAdvertiserId = ({ submission, form }) => {
    const directAdvertiserId = String(submission?.advertiser_id || "").trim();
    if (directAdvertiserId) {
      return directAdvertiserId;
    }

    const advertiserEmail = normalizeEmailAddress(form?.email || submission?.email || "");
    if (advertiserEmail) {
      const advertiserByEmail = advertisers.find(
        (item) => normalizeEmailAddress(item?.email || "") === advertiserEmail,
      );
      if (advertiserByEmail?.id) {
        return String(advertiserByEmail.id).trim();
      }
    }

    const advertiserName = normalizeComparableText(
      form?.advertiser_name || submission?.advertiser_name || submission?.advertiser || "",
    );
    if (advertiserName) {
      const advertiserByName = advertisers.find(
        (item) => normalizeComparableText(item?.advertiser_name || item?.advertiser || "") === advertiserName,
      );
      if (advertiserByName?.id) {
        return String(advertiserByName.id).trim();
      }
    }

    return "";
  };

  const resolveSubmissionProductId = ({ submission, form }) => {
    const directProductId = String(submission?.product_id || "").trim();
    if (directProductId) {
      return directProductId;
    }

    const placement = String(form?.placement || submission?.placement || "").trim();
    if (placement) {
      const productByPlacement = products.find(
        (item) => String(item?.placement || "").trim().toLowerCase() === placement.toLowerCase(),
      );
      if (productByPlacement?.id) {
        return String(productByPlacement.id).trim();
      }
    }

    const firstProductId = String(products[0]?.id || "").trim();
    return firstProductId || "";
  };

  const buildSubmissionApprovalSchedule = (form) => {
    const normalizedPostType = normalizeCreateAdPostType(form?.post_type || "");
    const normalizedPostTime = normalizeCustomDateTimeValue(form?.post_time || "");
    const schedule = {};

    if (normalizedPostType === "Daily Run") {
      schedule.start_date = String(form?.post_date_from || "").trim();
      schedule.end_date = String(form?.post_date_to || "").trim();
    } else if (normalizedPostType === "Custom Schedule") {
      schedule.custom_dates = normalizeCustomDatesForForm(form?.custom_dates, {
        fallbackTime: normalizedPostTime,
        fallbackReminder: "15-min",
      });
    } else {
      schedule.post_date = String(form?.post_date_from || "").trim();
    }

    if (normalizedPostTime) {
      schedule.post_time = normalizedPostTime;
    }

    return schedule;
  };

  const isSubmissionRowInteractiveTarget = (target) => {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, a, input, select, textarea, label, [data-stop-submission-row-click='true']",
        ),
      )
    );
  };

  const handleSubmissionRowClick = (event, submission) => {
    if (isSubmissionRowInteractiveTarget(event.target)) {
      return;
    }
    openSubmissionEditModal(submission);
  };

  const toggleSubmissionRejectReason = (reason, checked) => {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      return;
    }

    setSubmissionRejectSelectedReasons((current) => {
      if (checked) {
        return mergeUniqueSubmissionReasons(current, [normalizedReason]);
      }
      return current.filter(
        (item) =>
          String(item || "").trim().toLowerCase() !== normalizedReason.toLowerCase(),
      );
    });
  };

  const addSubmissionRejectReasonOption = () => {
    const normalizedReason = String(submissionRejectNewReason || "").trim();
    if (!normalizedReason) {
      return;
    }

    const reasonToAdd = normalizedReason.slice(0, 120);
    setSubmissionRejectReasonLibrary((current) => {
      const next = mergeUniqueSubmissionReasons(current, [reasonToAdd]);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            SUBMISSION_REJECTION_REASON_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {
          // Ignore localStorage failures in private mode/quota limits.
        }
      }
      return next;
    });
    setSubmissionRejectSelectedReasons((current) =>
      mergeUniqueSubmissionReasons(current, [reasonToAdd]),
    );
    setSubmissionRejectNewReason("");
  };

  const handleSubmissionEditChange = (field, value) => {
    setSubmissionEditForm((current) => {
      const normalizedValue =
        field === "phone_number" ? formatUSPhoneNumber(value) : value;
      const next = {
        ...current,
        [field]: normalizedValue,
      };
      submissionEditFormRef.current = next;

      if (["post_date_from", "post_time"].includes(field)) {
        const dateValue = field === "post_date_from" ? normalizedValue : current.post_date_from;
        const timeValue = field === "post_time" ? normalizedValue : current.post_time;
        if (dateValue && timeValue) {
          setSubmissionEditPastTimeError(
            isPastDateTimeInAppTimeZone(dateValue, timeValue)
              ? "This date and time is in the past. Please choose a future time."
              : null,
          );
        } else {
          setSubmissionEditPastTimeError(null);
        }
      }

      return next;
    });

    if (["post_type", "post_date_from", "post_date_to", "post_time", "custom_dates"].includes(field)) {
      submissionEditAvailabilityRequestIdRef.current += 1;
      setSubmissionEditCheckingAvailability(false);
      setSubmissionEditAvailabilityError(null);
      setSubmissionEditFullyBookedDates([]);
    }
  };

  const addSubmissionEditMedia = (mediaItem) => {
    setSubmissionEditForm((current) => {
      const next = {
        ...current,
        media: [...(Array.isArray(current.media) ? current.media : []), mediaItem],
      };
      submissionEditFormRef.current = next;
      return next;
    });
  };

  const removeSubmissionEditMedia = (index) => {
    setSubmissionEditForm((current) => {
      const next = {
        ...current,
        media: (Array.isArray(current.media) ? current.media : []).filter((_, i) => i !== index),
      };
      submissionEditFormRef.current = next;
      return next;
    });
  };

  const addSubmissionEditCustomDate = () => {
    if (!submissionEditCustomDate) {
      return;
    }

    setSubmissionEditForm((current) => {
      const existing = Array.isArray(current.custom_dates) ? current.custom_dates : [];
      const exists = existing.some((entry) => {
        const entryDate = typeof entry === "object" && entry !== null ? entry.date : entry;
        return String(entryDate || "") === submissionEditCustomDate;
      });
      if (exists) {
        return current;
      }

      const timeForDate = submissionEditCustomTime || current.post_time || "";
      const timeWithSeconds =
        timeForDate && timeForDate.length === 5 ? `${timeForDate}:00` : timeForDate;

      const next = {
        ...current,
        custom_dates: [
          ...existing,
          {
            date: submissionEditCustomDate,
            time: timeWithSeconds,
            reminder: "15-min",
          },
        ],
      };
      submissionEditFormRef.current = next;
      return next;
    });

    setSubmissionEditCustomDate("");
    setSubmissionEditCustomTime("");
    submissionEditAvailabilityRequestIdRef.current += 1;
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditFullyBookedDates([]);
  };

  const removeSubmissionEditCustomDate = (dateToRemove) => {
    setSubmissionEditForm((current) => {
      const next = {
        ...current,
        custom_dates: (Array.isArray(current.custom_dates) ? current.custom_dates : []).filter(
          (entry) => {
            const entryDate = typeof entry === "object" && entry !== null ? entry.date : entry;
            return entryDate !== dateToRemove;
          },
        ),
      };
      submissionEditFormRef.current = next;
      return next;
    });

    submissionEditAvailabilityRequestIdRef.current += 1;
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditFullyBookedDates([]);
  };

  const updateSubmissionEditCustomDateTime = (dateStr, newTime) => {
    const timeWithSeconds =
      newTime && newTime.length === 5 ? `${newTime}:00` : newTime;

    setSubmissionEditForm((current) => {
      const next = {
        ...current,
        custom_dates: (Array.isArray(current.custom_dates) ? current.custom_dates : []).map(
          (entry) => {
            if (typeof entry === "object" && entry !== null && entry.date === dateStr) {
              return { ...entry, time: timeWithSeconds };
            }
            if (typeof entry === "string" && entry === dateStr) {
              return { date: entry, time: timeWithSeconds, reminder: "15-min" };
            }
            return entry;
          },
        ),
      };
      submissionEditFormRef.current = next;
      return next;
    });

    submissionEditAvailabilityRequestIdRef.current += 1;
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditFullyBookedDates([]);
  };

  const checkSubmissionEditAvailability = async () => {
    if (!submissionEditModal?.id) {
      return { available: true, availabilityError: null, fullyBookedDates: [] };
    }

    const requestId = submissionEditAvailabilityRequestIdRef.current + 1;
    submissionEditAvailabilityRequestIdRef.current = requestId;
    setSubmissionEditCheckingAvailability(true);
    setSubmissionEditAvailabilityError(null);
    setSubmissionEditFullyBookedDates([]);

    try {
      const currentForm = submissionEditFormRef.current;
      const result = await checkAdAvailability({
        postType: currentForm.post_type,
        postDateFrom: currentForm.post_date_from,
        postDateTo: currentForm.post_date_to,
        customDates: currentForm.custom_dates,
        postTime: currentForm.post_time,
        excludeAdId: submissionEditModal.id,
      });

      if (requestId !== submissionEditAvailabilityRequestIdRef.current) {
        return result;
      }

      if (!result.available) {
        setSubmissionEditAvailabilityError(result.availabilityError);
        setSubmissionEditFullyBookedDates(result.fullyBookedDates);
      }

      return result;
    } catch (error) {
      console.error("Error checking submission availability:", error);
      if (requestId === submissionEditAvailabilityRequestIdRef.current) {
        setSubmissionEditAvailabilityError("Could not check availability. Please try again.");
      }
      throw error;
    } finally {
      if (requestId === submissionEditAvailabilityRequestIdRef.current) {
        setSubmissionEditCheckingAvailability(false);
      }
    }
  };

  const saveSubmissionEdit = async () => {
    if (!submissionEditModal?.id) {
      return;
    }

    const currentForm = submissionEditFormRef.current;

    if (
      !currentForm.advertiser_name ||
      !currentForm.contact_name ||
      !currentForm.email ||
      !currentForm.phone_number ||
      !currentForm.ad_name
    ) {
      appToast.error({
        title: "Complete all required fields before saving.",
      });
      return;
    }

    if (!isCompleteUSPhoneNumber(currentForm.phone_number)) {
      appToast.error({
        title: "Phone number must be a complete US number.",
      });
      return;
    }

    if (
      currentForm.post_type === "One-Time Post" &&
      currentForm.post_date_from &&
      currentForm.post_time &&
      isPastDateTimeInAppTimeZone(currentForm.post_date_from, currentForm.post_time)
    ) {
      setSubmissionEditPastTimeError(
        "This date and time is in the past. Please choose a future time.",
      );
      appToast.error({
        title: "Cannot save a submission scheduled in the past.",
      });
      return;
    }

    if (currentForm.post_type === "Daily Run") {
      if (!currentForm.post_date_from || !currentForm.post_date_to) {
        appToast.error({
          title: "Start date and end date are required.",
        });
        return;
      }
      if (currentForm.post_date_to < currentForm.post_date_from) {
        appToast.error({
          title: "End date must be on or after the start date.",
        });
        return;
      }
    }

    if (
      currentForm.post_type === "Custom Schedule" &&
      (!Array.isArray(currentForm.custom_dates) || currentForm.custom_dates.length === 0)
    ) {
      appToast.error({
        title: "Add at least one custom date before saving.",
      });
      return;
    }

    try {
      const availability = await checkSubmissionEditAvailability();
      if (!availability?.available) {
        appToast.error({
          title: availability.availabilityError || "Selected dates are unavailable.",
        });
        return;
      }
    } catch {
      appToast.error({
        title: "Could not check availability. Please try again.",
      });
      return;
    }

    setSubmissionEditLoading(true);

    try {
      const response = await fetchWithSessionAuth(`/api/submissions/${submissionEditModal.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...currentForm,
          custom_dates: currentForm.custom_dates,
          post_time:
            currentForm.post_time && currentForm.post_time.length === 5
              ? `${currentForm.post_time}:00`
              : currentForm.post_time,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update submission.");
      }

      invalidateDbCache();
      await ensureDb();
      setDb(readDb());
      resetSubmissionEditState();
      appToast.success({
        title: "Submission updated.",
      });
    } catch (error) {
      console.error("Failed to update submission:", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to update submission.",
      });
    } finally {
      setSubmissionEditLoading(false);
    }
  };

  const submissionEditStatus = String(submissionEditModal?.status || "").toLowerCase();
  const canModalApproveSubmission =
    canConvertSubmissions &&
    ["pending", "not_approved"].includes(submissionEditStatus);
  const canModalRejectSubmission =
    canRejectSubmissions &&
    ["pending", "not_approved"].includes(submissionEditStatus);
  const canModalDeleteSubmission =
    canBatchDeleteSubmissions && submissionEditStatus === "not_approved";
  const isSubmissionReviewMode =
    canModalApproveSubmission || canModalRejectSubmission || canModalDeleteSubmission;
  const submissionReviewDescription = canModalDeleteSubmission
    ? "Review details, then approve to continue in Ad Editor, reject, or delete."
    : "Review details, then approve to continue in Ad Editor or reject.";
  const hasSubmissionRejectFeedback =
    mergeUniqueSubmissionReasons(submissionRejectSelectedReasons).length > 0 ||
    String(submissionRejectNote || "").trim().length > 0;
  const submissionReviewActionOptions = useMemo(() => {
    const options = [];
    if (canModalApproveSubmission) {
      options.push({ value: "approve", label: "Approve & Edit Ad" });
    }
    if (canModalRejectSubmission) {
      options.push({ value: "reject", label: "Reject" });
    }
    if (canModalDeleteSubmission) {
      options.push({ value: "delete", label: "Delete" });
    }
    return options;
  }, [canModalApproveSubmission, canModalDeleteSubmission, canModalRejectSubmission]);

  useEffect(() => {
    if (!isSubmissionReviewMode) {
      if (submissionReviewAction !== "") {
        setSubmissionReviewAction("");
      }
      return;
    }

    const allowedActions = new Set(
      submissionReviewActionOptions.map((option) => option.value),
    );
    if (allowedActions.has(submissionReviewAction)) {
      return;
    }
    setSubmissionReviewAction(submissionReviewActionOptions[0]?.value || "");
  }, [isSubmissionReviewMode, submissionReviewAction, submissionReviewActionOptions]);

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

    if (
      settingsProfileWhatsapp &&
      !isCompleteUSPhoneNumber(settingsProfileWhatsapp)
    ) {
      setSettingsProfileMessage({
        type: "error",
        text: "WhatsApp number must be a complete US number.",
      });
      return;
    }

    setSettingsProfileSaving(true);
    setSettingsProfileMessage(null);
    try {
      const updated = await updateCurrentUser({
        name: settingsProfileName.trim() || user.name || "User",
        image: settingsProfileImage || "",
        whatsapp_number: formatUSPhoneNumber(settingsProfileWhatsapp),
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
    const role = String(settingsTeamRole || "").trim().toLowerCase();
    const allowedRoles = new Set(["admin", "manager", "staff"]);

    if (!name || !email) {
      setSettingsTeamError("Name and email are required.");
      return;
    }

    if (!allowedRoles.has(role)) {
      setSettingsTeamError("Role must be admin, manager, or staff.");
      return;
    }

    setSettingsTeamSaving(true);
    setSettingsTeamError("");

    try {
      if (
        (teamMembers || []).some(
          (item) => String(item.email || "").toLowerCase() === email,
        )
      ) {
        throw new Error("A team member with this email already exists.");
      }

      if (hasSupabaseConfig) {
        const response = await fetchWithSessionAuth("/api/admin/members", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            role,
          }),
        });
        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }
        if (!response.ok) {
          throw new Error(
            data?.error || `Failed to add team member (HTTP ${response.status}).`,
          );
        }

        invalidateDbCache();
        await ensureDb();
        setDb(readDb());

        appToast.success({
          title: "Team member added",
          description: data?.email_sent
            ? "Invite email sent with a verify and password setup link."
            : data?.warning || "Team member added, but invite email was not sent.",
        });

        if (data?.internal_notifications && !data.internal_notifications.telegram_sent) {
          appToast.warning({
            title: "Telegram notification not sent",
            description:
              data.internal_notifications.telegram_error ||
              "No active Telegram recipients are configured in notification settings.",
          });
        }
      } else {
        await upsertTeamMember({
          id: createId("member"),
          name,
          email,
          role,
        });
        setDb(readDb());
      }

      setSettingsTeamModalOpen(false);
      setSettingsTeamName("");
      setSettingsTeamEmail("");
      setSettingsTeamRole("staff");
      setSettingsTeamError("");
    } catch (error) {
      setSettingsTeamError(
        error instanceof Error ? error.message : "Failed to add member",
      );
    } finally {
      setSettingsTeamSaving(false);
    }
  };

  const executeSettingsRemoveMember = async (member) => {
    try {
      await deleteTeamMember(member.id);
      setDb(readDb());
      setSettingsTeamError("");
    } catch (error) {
      setSettingsTeamError(
        error instanceof Error ? error.message : "Failed to remove member",
      );
    }
  };

  const handleSettingsRemoveMember = (member) => {
    const memberEmail = String(member.email || "").toLowerCase();
    if (memberEmail && memberEmail === String(user?.email || "").toLowerCase()) {
      setSettingsTeamError("You cannot remove the currently signed-in account.");
      return;
    }

    const memberLabel = String(member.name || member.email || "this team member").trim();
    const memberId = String(member.id || member.email || "member").trim();
    if (!memberId) {
      return;
    }

    appToast.warning({
      id: `confirm-remove-member-${memberId}`,
      title: "Remove team member?",
      description: `This will remove ${memberLabel}.`,
      duration: 8000,
      action: {
        label: "Remove",
        onClick: () => {
          void executeSettingsRemoveMember(member);
        },
      },
    });
  };

  const handleSettingsSaveNotifications = async () => {
    if (
      settingsNotification.phone_number &&
      !isCompleteUSPhoneNumber(settingsNotification.phone_number)
    ) {
      setSettingsNotificationMessage({
        type: "error",
        text: "Phone number must be a complete US number.",
      });
      return;
    }

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

  const handleSettingsSendTestWhatsApp = async () => {
    setSettingsNotificationWhatsAppTesting(true);
    setSettingsNotificationMessage(null);
    try {
      const response = await fetchWithSessionAuth("/api/admin/send-test-whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to send WhatsApp test (${response.status})`);
      }
      const recipient = String(payload?.to || "").trim();
      const messageId = String(payload?.message_id || "").trim();
      setSettingsNotificationMessage({
        type: "info",
        text: recipient
          ? `WhatsApp accepted for ${recipient}${messageId ? ` (ID: ${messageId})` : ""}.`
          : `WhatsApp accepted${messageId ? ` (ID: ${messageId})` : ""}.`,
      });
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp test message.",
      });
    } finally {
      setSettingsNotificationWhatsAppTesting(false);
    }
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

  const handleSettingsToggleTelegramEnabled = async (nextEnabled) => {
    setSettingsNotification((current) => ({
      ...current,
      telegram_enabled: nextEnabled,
    }));

    try {
      await updateDb((currentDb) => {
        const list = Array.isArray(currentDb.telegram_chat_ids)
          ? currentDb.telegram_chat_ids
          : [];
        if (list.length === 0) {
          return currentDb;
        }

        const now = new Date().toISOString();
        currentDb.telegram_chat_ids = list.map((item) => ({
          ...item,
          is_active: nextEnabled,
          updated_at: now,
        }));
        return currentDb;
      });
      setDb(readDb());
    } catch (error) {
      setSettingsNotificationMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update Telegram notification status.",
      });
    }
  };

  const executeSettingsDeleteTelegramChatId = async (id) => {
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

  const handleSettingsDeleteTelegramChatId = (id) => {
    const chatId = String(id || "").trim();
    if (!chatId) {
      return;
    }

    appToast.warning({
      id: `confirm-delete-telegram-chat-${chatId}`,
      title: "Delete Telegram chat ID?",
      description: "This cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => {
          void executeSettingsDeleteTelegramChatId(id);
        },
      },
    });
  };

  const handleSettingsTestTelegram = async (chatId, label) => {
    setSettingsTelegramTesting(chatId);
    setSettingsNotificationMessage(null);
    try {
      const response = await fetchWithSessionAuth("/api/admin/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ <b>CBN Ads Manager</b>\n\nTest message received! Telegram notifications are working for "<b>${label}</b>".`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to send");
      setSettingsNotificationMessage({
        type: "success",
        text: `Test message sent to "${label}"!`,
      });
    } catch (err) {
      setSettingsNotificationMessage({
        type: "error",
        text: `Failed to send test message: ${err.message}`,
      });
    } finally {
      setSettingsTelegramTesting(null);
    }
  };

  const handleSettingsSetupTelegramWebhook = async () => {
    setSettingsTelegramWebhookLoading(true);
    setSettingsTelegramWebhookStatus(null);
    try {
      const response = await fetchWithSessionAuth("/api/admin/telegram/verify");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Verification failed");
      setSettingsTelegramWebhookStatus({
        type: "success",
        text: `Bot verified: @${data.bot?.username || "unknown"} is connected and ready.`,
      });
    } catch (err) {
      setSettingsTelegramWebhookStatus({
        type: "error",
        text: `Bot verification failed: ${err.message}`,
      });
    } finally {
      setSettingsTelegramWebhookLoading(false);
    }
  };

  const handleSettingsCheckReminders = async () => {
    setSettingsNotificationChecking(true);
    setSettingsReminderResults(null);
    setSettingsNotificationMessage(null);

    try {
      const response = await fetchWithSessionAuth("/api/admin/send-reminders?debug=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Reminder check failed (${response.status})`);
      }

      const results = Array.isArray(payload?.results) ? payload.results : [];
      setSettingsReminderResults({
        totalResults: Number(payload?.totalResults) || results.length,
        results,
      });

      if (results.length === 0) {
        setSettingsNotificationMessage({
          type: "info",
          text: "No reminders due at this time.",
        });
      } else {
        setSettingsNotificationMessage({
          type: "success",
          text: `Processed ${results.length} reminder action(s). See results below.`,
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
      const response = await fetchWithSessionAuth("/api/admin/fix-all-spending", {
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

  const handleConfirmWhatsAppDelete = (messageId) => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) {
      return;
    }

    appToast.warning({
      id: `confirm-delete-whatsapp-${normalizedMessageId}`,
      title: "Delete this message?",
      description: "This cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => {
          void handleWhatsAppDelete(messageId);
        },
      },
    });
  };

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

  const mutateWhatsAppNotificationPreferences = async (mutator) => {
    await updateDb((currentDb) => {
      const currentPreferences =
        currentDb.notification_preferences &&
          typeof currentDb.notification_preferences === "object"
          ? currentDb.notification_preferences
          : {};
      const nextPreferences = {
        ...currentPreferences,
        whatsapp_recipients: Array.isArray(currentPreferences.whatsapp_recipients)
          ? currentPreferences.whatsapp_recipients
          : [],
        whatsapp_settings: createDefaultWhatsAppSettingsDraft(
          currentPreferences.whatsapp_settings,
        ),
      };
      mutator(nextPreferences);
      currentDb.notification_preferences = nextPreferences;
      return currentDb;
    });
    setDb(readDb());
  };

  const handleWhatsAppAddRecipient = async () => {
    const label = String(whatsAppNewRecipientLabel || "").trim();
    const phone = normalizeWhatsAppE164Input(whatsAppNewRecipientPhone);

    if (!label) {
      appToast.error({
        title: "Recipient label is required.",
      });
      return;
    }

    if (!isValidWhatsAppE164Input(phone)) {
      appToast.error({
        title: "Enter a valid E.164 phone number (example: +15551234567).",
      });
      return;
    }

    setWhatsAppRecipientAdding(true);
    try {
      await mutateWhatsAppNotificationPreferences((preferences) => {
        const list = Array.isArray(preferences.whatsapp_recipients)
          ? preferences.whatsapp_recipients
          : [];
        if (
          list.some(
            (item) =>
              normalizeWhatsAppE164Input(item?.phone_e164 || "") ===
              normalizeWhatsAppE164Input(phone),
          )
        ) {
          throw new Error("That WhatsApp number already exists.");
        }

        const now = new Date().toISOString();
        preferences.whatsapp_recipients = [
          ...list,
          {
            id: createId(),
            label,
            phone_e164: phone,
            is_active: true,
            created_at: now,
            updated_at: now,
          },
        ];
      });
      setWhatsAppNewRecipientLabel("");
      setWhatsAppNewRecipientPhone("");
      appToast.success({
        title: "WhatsApp recipient added.",
      });
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to add WhatsApp recipient.",
      });
    } finally {
      setWhatsAppRecipientAdding(false);
    }
  };

  const handleWhatsAppToggleRecipient = async (recipientId, isActive) => {
    try {
      await mutateWhatsAppNotificationPreferences((preferences) => {
        const list = Array.isArray(preferences.whatsapp_recipients)
          ? preferences.whatsapp_recipients
          : [];
        const now = new Date().toISOString();
        preferences.whatsapp_recipients = list.map((item) =>
          item.id === recipientId
            ? {
              ...item,
              is_active: isActive,
              updated_at: now,
            }
            : item,
        );
      });
      appToast.success({
        title: isActive ? "Recipient enabled." : "Recipient disabled.",
      });
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to update recipient.",
      });
    }
  };

  const handleWhatsAppDeleteRecipient = async (recipientId) => {
    try {
      await mutateWhatsAppNotificationPreferences((preferences) => {
        const list = Array.isArray(preferences.whatsapp_recipients)
          ? preferences.whatsapp_recipients
          : [];
        preferences.whatsapp_recipients = list.filter((item) => item.id !== recipientId);
      });
      appToast.success({
        title: "WhatsApp recipient removed.",
      });
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to remove recipient.",
      });
    }
  };

  const handleWhatsAppSaveSettings = async () => {
    setWhatsAppSettingsSaving(true);
    try {
      const normalizedSettings = createDefaultWhatsAppSettingsDraft(whatsAppSettingsDraft);
      await mutateWhatsAppNotificationPreferences((preferences) => {
        preferences.whatsapp_settings = normalizedSettings;
      });
      appToast.success({
        title: "WhatsApp settings saved.",
      });
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to save WhatsApp settings.",
      });
    } finally {
      setWhatsAppSettingsSaving(false);
    }
  };

  const handleWhatsAppTestRecipient = async (recipient) => {
    const to = normalizeWhatsAppE164Input(recipient?.phone_e164 || "");
    if (!isValidWhatsAppE164Input(to)) {
      appToast.error({
        title: "Recipient phone number is invalid.",
      });
      return;
    }

    setWhatsAppRecipientTesting(String(recipient?.id || to));
    try {
      const response = await fetchWithSessionAuth("/api/admin/send-test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          use_template: true,
          template_only: true,
          template_name: whatsAppSettingsDraft.template_name || undefined,
          template_language: whatsAppSettingsDraft.template_language || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send WhatsApp test message.");
      }

      const metaId = String(payload?.message_id || "").trim();
      appToast.success({
        title: "WhatsApp test accepted.",
        description: `${to}${metaId ? ` (Meta ID: ${metaId})` : ""}`,
      });
    } catch (error) {
      appToast.error({
        title: "Failed to send WhatsApp test",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setWhatsAppRecipientTesting(null);
    }
  };

  const handleWhatsAppTestAllActiveRecipients = async () => {
    if (whatsAppActiveRecipientCount === 0) {
      appToast.warning({
        title: "No active recipients",
        description: "Enable at least one WhatsApp recipient first.",
      });
      return;
    }

    setWhatsAppBulkTesting(true);
    try {
      const response = await fetchWithSessionAuth("/api/admin/send-test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_saved_recipients: true,
          use_template: true,
          template_only: true,
          template_name: whatsAppSettingsDraft.template_name || undefined,
          template_language: whatsAppSettingsDraft.template_language || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send WhatsApp tests.");
      }

      const successCount = Number(payload?.successful_count || 0);
      const failedCount = Number(payload?.failed_count || 0);
      appToast.success({
        title: "WhatsApp test dispatch completed.",
        description:
          failedCount > 0
            ? `${successCount} sent, ${failedCount} failed.`
            : `${successCount} recipient(s) accepted by Meta.`,
      });
    } catch (error) {
      appToast.error({
        title: "Failed to send WhatsApp tests",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setWhatsAppBulkTesting(false);
    }
  };



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

  const openInvoiceMenu = (invoiceId, status, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = status === "Paid" ? 150 : 238;
    const gap = 6;
    const viewportPadding = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - menuHeight - viewportPadding),
    );

    let left = rect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding),
    );

    setInvoiceMenuCoordinates({
      top,
      left,
    });
    setOpenInvoiceMenuId((current) => (current === invoiceId ? null : invoiceId));
  };

  const openInvoiceEditor = (item) => {
    if (!isAdmin) {
      return;
    }
    setBillingComposerMode("invoice");
    setInvoice({
      ...createBlankInvoice(),
      ...item,
      issue_date: getTodayInAppTimeZone(),
      status: normalizeInvoiceStatus(item.status),
      ad_ids: toStringArray(item.ad_ids),
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
        advertisers.find(
          (adv) => String(adv.id || "") === String(item.advertiser_id || ""),
        )?.advertiser_name ||
        "-",
      status: normalizeInvoiceStatus(item.status),
      ad_ids: toStringArray(item.ad_ids),
    });
    setOpenInvoiceMenuId(null);
  };

  const resendInvoicePaymentReminder = async (item) => {
    if (!isAdmin) {
      return;
    }

    const normalizedInvoiceId = String(item?.id || "").trim();
    if (!normalizedInvoiceId || pendingInvoiceActionIdsRef.current.has(normalizedInvoiceId)) {
      return;
    }

    const toastId = getInvoiceActionToastId("ready-reminder", normalizedInvoiceId);
    pendingInvoiceActionIdsRef.current.add(normalizedInvoiceId);
    setPendingInvoiceActionIds((current) =>
      current.includes(normalizedInvoiceId) ? current : [...current, normalizedInvoiceId],
    );
    setOpenInvoiceMenuId(null);
    appToast.info({
      id: toastId,
      title: "Sending payment reminder...",
      description: "Please wait while we notify the advertiser.",
      duration: Infinity,
    });

    try {
      const reminderResult = await sendReadyForPaymentReminder({
        invoiceRecord: item,
      });

      if (reminderResult?.success) {
        appToast.success({
          title: "Payment reminder sent.",
          description: `Sent to ${reminderResult.email || "the advertiser email"}.`,
        });
        return;
      }

      if (reminderResult?.reason === "missing_ad") {
        appToast.warning({
          title: "Reminder not sent.",
          description: "No linked ad was found for this invoice.",
        });
        return;
      }

      appToast.warning({
        title: "Reminder not sent.",
        description:
          reminderResult?.error ||
          "Could not send ready-for-payment email for this invoice.",
      });
    } finally {
      appToast.dismiss(toastId);
      pendingInvoiceActionIdsRef.current.delete(normalizedInvoiceId);
      setPendingInvoiceActionIds((current) =>
        current.filter((id) => id !== normalizedInvoiceId),
      );
    }
  };

  const markInvoiceAsPaid = async (item) => {
    if (!isAdmin) {
      return;
    }
    const normalizedInvoiceId = String(item?.id || "").trim();
    if (!normalizedInvoiceId || pendingInvoiceActionIdsRef.current.has(normalizedInvoiceId)) {
      return;
    }

    const toastId = getInvoiceActionToastId("paid", normalizedInvoiceId);
    pendingInvoiceActionIdsRef.current.add(normalizedInvoiceId);
    setPendingInvoiceActionIds((current) =>
      current.includes(normalizedInvoiceId) ? current : [...current, normalizedInvoiceId],
    );
    setOpenInvoiceMenuId(null);
    appToast.info({
      id: toastId,
      title: "Updating invoice...",
      description: "Please wait while the invoice is marked as paid.",
      duration: Infinity,
    });
    try {
      await run(async () => {
        await upsertInvoice({
          ...item,
          status: "Paid",
          ad_ids: Array.isArray(item.ad_ids) ? item.ad_ids : [],
        });
        if (String(invoicePreviewModal?.id || "").trim() === normalizedInvoiceId) {
          setInvoicePreviewModal((current) =>
            current ? { ...current, status: "Paid" } : current,
          );
        }
      }, "Invoice marked as paid.");

      const paymentNotice = await sendPaidInvoiceNotice({
        invoiceId: normalizedInvoiceId,
      });
      if (paymentNotice?.error) {
        appToast.warning({
          title: "Invoice marked as paid, but payment notifications were incomplete.",
          description: paymentNotice.error,
        });
      }
    } finally {
      appToast.dismiss(toastId);
      pendingInvoiceActionIdsRef.current.delete(normalizedInvoiceId);
      setPendingInvoiceActionIds((current) =>
        current.filter((itemId) => itemId !== normalizedInvoiceId),
      );
    }
  };

  const deleteInvoiceRecord = async (invoiceId) => {
    if (!isAdmin) {
      return;
    }
    const normalizedInvoiceId = String(invoiceId || "").trim();
    if (!normalizedInvoiceId || pendingInvoiceActionIdsRef.current.has(normalizedInvoiceId)) {
      return;
    }

    const toastId = getInvoiceActionToastId("delete", normalizedInvoiceId);
    pendingInvoiceActionIdsRef.current.add(normalizedInvoiceId);
    setPendingInvoiceActionIds((current) =>
      current.includes(normalizedInvoiceId) ? current : [...current, normalizedInvoiceId],
    );
    setOpenInvoiceMenuId(null);
    appToast.info({
      id: toastId,
      title: "Deleting invoice...",
      description: "Please wait while the invoice is removed.",
      duration: Infinity,
    });
    try {
      await run(async () => {
        await deleteInvoice(normalizedInvoiceId);
        if (String(invoicePreviewModal?.id || "").trim() === normalizedInvoiceId) {
          setInvoicePreviewModal(null);
        }
      }, "Invoice deleted.");
    } finally {
      appToast.dismiss(toastId);
      pendingInvoiceActionIdsRef.current.delete(normalizedInvoiceId);
      setPendingInvoiceActionIds((current) =>
        current.filter((itemId) => itemId !== normalizedInvoiceId),
      );
    }
  };

  const handleToggleSelectInvoice = (invoiceId) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      next.has(String(invoiceId)) ? next.delete(String(invoiceId)) : next.add(String(invoiceId));
      return next;
    });
  };

  const handleSelectAllInvoices = () => {
    const allIds = filteredInvoices.map((i) => String(i.id));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedInvoiceIds.has(id));
    setSelectedInvoiceIds(allSelected ? new Set() : new Set(allIds));
  };

  const executeBatchDeleteInvoices = async (invoiceIds) => {
    const toastId = "batch-delete-invoices";
    appToast.info({ id: toastId, title: "Deleting invoices...", duration: Infinity });
    try {
      for (const id of invoiceIds) {
        await deleteInvoice(id);
      }
      if (invoiceIds.includes(String(invoicePreviewModal?.id || "").trim())) {
        setInvoicePreviewModal(null);
      }
      setDb(readDb());
      setSelectedInvoiceIds(new Set());
      appToast.success({
        title: `${invoiceIds.length} invoice${invoiceIds.length > 1 ? "s" : ""} deleted`,
      });
    } catch (error) {
      console.error("[AdsPage] Batch invoice delete failed", error);
      appToast.error({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete invoices.",
      });
    } finally {
      appToast.dismiss(toastId);
    }
  };

  const handleBatchDeleteInvoices = () => {
    if (selectedInvoiceIds.size === 0) return;
    const ids = [...selectedInvoiceIds];
    appToast.warning({
      id: "confirm-batch-delete-invoices",
      title: `Delete ${ids.length} invoice${ids.length > 1 ? "s" : ""}?`,
      description: "This cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => {
          void executeBatchDeleteInvoices(ids);
        },
      },
    });
  };

  const saveInvoiceForm = async () => {
    if (!isAdmin || invoiceSaving) {
      return;
    }
    setInvoiceSaving(true);
    appToast.info({
      id: INVOICE_SUBMIT_TOAST_ID,
      title: "Submitting invoice...",
      description: "Please wait while the invoice is saved.",
      duration: Infinity,
    });
    let paymentNoticeInvoiceId = "";
    let readyForPaymentReminderInvoice = null;
    let creditApplicationResult = null;
    let creditApplicationError = "";
    try {
      await run(async () => {
        if (isCreditComposer) {
          const advertiserId = String(invoice.advertiser_id || "").trim();
          const absoluteAmount = Math.abs(
            Number.parseFloat(String(invoice.total ?? invoice.amount ?? "").trim()) || 0,
          );
          const reason = String(invoice.notes || "").trim();

          if (!advertiserId) {
            throw new Error("Advertiser required");
          }
          if (!absoluteAmount) {
            throw new Error("Enter a credit amount.");
          }
          if (!reason) {
            throw new Error("Reason required");
          }

          const { data, updatedAdvertiser, nextDb } = await requestAdvertiserCreditsAdjustment({
            advertiserId,
            amount: absoluteAmount,
            reason,
          });

          if (
            advertiserViewModal?.advertiser?.id &&
            String(advertiserViewModal.advertiser.id) === advertiserId &&
            updatedAdvertiser
          ) {
            setAdvertiserViewModal(buildAdvertiserViewModalState(updatedAdvertiser, nextDb));
          }

          setBillingComposerMode("invoice");
          setInvoice(createBlankInvoice());
          setView("list");

          appToast.success({
            title: "Credits added.",
            description: data?.credit_invoice?.invoice_number
              ? `Recorded as ${data.credit_invoice.invoice_number}.`
              : undefined,
          });
          return;
        }

        const issueDate = getTodayInAppTimeZone();
        if (!invoice.advertiser_id) {
          throw new Error("Advertiser required");
        }
        const hasLineItems = Array.isArray(invoice.items) && invoice.items.length > 0;
        const hasLinkedAds = Array.isArray(invoice.ad_ids) && invoice.ad_ids.length > 0;
        const explicitAmountValue =
          Number.parseFloat(String(invoice.total ?? invoice.amount ?? "").trim()) || 0;
        const hasPositiveAmount = explicitAmountValue > 0;
        if (!hasPositiveAmount && !hasLineItems && !hasLinkedAds) {
          throw new Error("Link at least one ad, add line items, or enter a positive amount.");
        }

        let existingInvoice = null;
        if (invoice.id) {
          const refreshedDb = await refreshDbFromSupabase();
          existingInvoice =
            (Array.isArray(refreshedDb?.invoices) ? refreshedDb.invoices : []).find(
              (item) => String(item?.id || "") === String(invoice.id || ""),
            ) || null;
        }

        const savedInvoice = await upsertInvoice({
          ...(existingInvoice || {}),
          ...invoice,
          ad_ids:
            Array.isArray(invoice.ad_ids) && invoice.ad_ids.length > 0
              ? invoice.ad_ids
              : Array.isArray(existingInvoice?.ad_ids)
                ? existingInvoice.ad_ids
                : [],
          items:
            Array.isArray(invoice.items) && invoice.items.length > 0
              ? invoice.items
              : Array.isArray(existingInvoice?.items)
                ? existingInvoice.items
                : [],
          issue_date: issueDate,
          status: normalizeInvoiceStatus(invoice.status),
        });
        const hasExistingInvoice = Boolean(existingInvoice?.id);
        const previousInvoiceStatus = hasExistingInvoice
          ? normalizeInvoiceStatus(existingInvoice?.status || "")
          : "";
        const nextInvoiceStatus = normalizeInvoiceStatus(
          savedInvoice?.status || invoice.status || "",
        );
        if (nextInvoiceStatus === "Paid" && previousInvoiceStatus !== "Paid") {
          paymentNoticeInvoiceId = String(savedInvoice?.id || invoice.id || "").trim();
        }
        if (
          nextInvoiceStatus === "Pending" &&
          hasSupabaseConfig
        ) {
          try {
            const response = await fetchWithSessionAuth("/api/admin/invoices/apply-credits", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                invoice_id: String(savedInvoice?.id || invoice.id || "").trim(),
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data?.error || "Failed to check prepaid credits.");
            }
            creditApplicationResult = data || null;
            if (
              !creditApplicationResult?.applied &&
              !isInvoicePaidViaCredits(creditApplicationResult?.invoice)
            ) {
              if (!hasExistingInvoice || previousInvoiceStatus !== "Pending") {
                readyForPaymentReminderInvoice = creditApplicationResult?.invoice || savedInvoice;
              }
            }
          } catch (error) {
            creditApplicationError =
              error instanceof Error ? error.message : "Failed to check prepaid credits.";
          }
        } else if (
          nextInvoiceStatus === "Pending" &&
          (!hasExistingInvoice || previousInvoiceStatus !== "Pending")
        ) {
          readyForPaymentReminderInvoice = savedInvoice;
        }
        setInvoice(createBlankInvoice());
        setBillingComposerMode("invoice");
        setView("list");
      }, isCreditComposer ? "" : "Invoice saved.");

      if (creditApplicationResult?.invoice || creditApplicationResult?.applied) {
        await refreshDbFromSupabase();
      }

      if (
        creditApplicationResult?.applied ||
        isInvoicePaidViaCredits(creditApplicationResult?.invoice)
      ) {
        appToast.success({
          title: "Invoice paid via credits.",
        });
        if (
          creditApplicationResult?.notice &&
          creditApplicationResult.notice.skipped !== true &&
          creditApplicationResult.notice?.advertiser_email_sent === false
        ) {
          appToast.warning({
            title: "Credits applied, but the advertiser notice was not sent.",
            description:
              creditApplicationResult.notice?.advertiser_email_error ||
              "Failed to send the credit notice email.",
          });
        }
      } else if (creditApplicationError) {
        appToast.warning({
          title: "Invoice saved, but prepaid credit check failed.",
          description: creditApplicationError,
        });
      }

      if (readyForPaymentReminderInvoice) {
        const readyReminderResult = await sendReadyForPaymentReminder({
          invoiceRecord: readyForPaymentReminderInvoice,
        });
        if (readyReminderResult?.success) {
          appToast.success({
            title: "Ready-for-payment email sent.",
            description: `Sent to ${readyReminderResult.email || "the advertiser email"}.`,
          });
        } else if (readyReminderResult?.error) {
          appToast.warning({
            title: "Invoice saved, but ready-for-payment email was not sent.",
            description: readyReminderResult.error,
          });
        } else if (readyReminderResult?.reason === "missing_ad") {
          appToast.warning({
            title: "Invoice saved, but reminder could not be sent.",
            description: "No linked ad was found for this invoice.",
          });
        }
      }

      if (paymentNoticeInvoiceId) {
        const paymentNotice = await sendPaidInvoiceNotice({
          invoiceId: paymentNoticeInvoiceId,
        });
        if (paymentNotice?.error) {
          appToast.warning({
            title: "Invoice saved, but payment notifications were incomplete.",
            description: paymentNotice.error,
          });
        }
      }
    } finally {
      appToast.dismiss(INVOICE_SUBMIT_TOAST_ID);
      setInvoiceSaving(false);
    }
  };

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
    if (!canEditAds) {
      return;
    }
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

    const normalizedPostTime = String(item.post_time || "").slice(0, 8);
    const normalizedCustomDates = normalizeCustomDatesForForm(item.custom_dates, {
      fallbackTime: normalizedPostTime,
      fallbackReminder: "15-min",
    });

    setAd({
      ...blankAd,
      ...item,
      advertiser_id: advertiserId,
      product_id: productId,
      placement: item.placement || "",
      post_date: item.schedule || item.post_date || item.post_date_from || "",
      post_date_from: item.post_date_from || item.schedule || item.post_date || "",
      post_date_to: item.post_date_to || "",
      custom_dates: normalizedCustomDates,
      post_time: normalizedPostTime.slice(0, 5),
      ad_text: item.ad_text || item.notes || "",
      media: parseAdMedia(item.media),
      payment:
        String(item.payment_raw || item.payment || "").toLowerCase() === "paid"
          ? "Paid"
          : "Unpaid",
      payment_mode:
        item.payment_mode ||
        (String(item.payment_raw || item.payment || "").toLowerCase() === "paid"
          ? "Paid"
          : item.price
            ? "Custom Amount"
            : "TBD"),
    });
    setCreateAdCustomDate("");
    setCreateAdCustomTime("");
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
    setView("createAd");
  };

  const closeCreateAd = () => {
    if (createAdSubmitting) {
      return;
    }
    setView("list");
    createAdStateRef.current = blankAd;
    setAd(blankAd);
    setCreateAdCustomDate("");
    setCreateAdCustomTime("");
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
    closeAdvertiserCreate();
  };

  const setCreateAdPostType = (postType) => {
    createAdAvailabilityRequestIdRef.current += 1;
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
    setAd((current) => {
      const next = {
        ...current,
        post_type: toCreateAdPostTypeValue(postType),
      };

      if (postType === "One-Time Post") {
        next.post_date_from = current.post_date_from || current.post_date || "";
        next.post_date = next.post_date_from;
        next.post_date_to = "";
        next.custom_dates = [];
      } else if (postType === "Daily Run") {
        next.post_date = current.post_date || current.post_date_from || "";
        next.custom_dates = [];
      } else if (!Array.isArray(next.custom_dates)) {
        next.custom_dates = [];
      }

      createAdStateRef.current = next;
      return next;
    });
  };

  const handleCreateAdChange = (field, value) => {
    if (field === "post_type") {
      setCreateAdPostType(value);
      return;
    }

    if (["post_date", "post_date_from", "post_date_to", "post_time", "custom_dates"].includes(field)) {
      createAdAvailabilityRequestIdRef.current += 1;
      setCreateAdCheckingAvailability(false);
      setCreateAdAvailabilityError(null);
      setCreateAdFullyBookedDates([]);
    }

    setAd((current) => {
      const next = { ...current, [field]: value };
      createAdStateRef.current = next;
      return next;
    });
  };

  const checkCreateAdAvailability = async () => {
    const requestId = createAdAvailabilityRequestIdRef.current + 1;
    createAdAvailabilityRequestIdRef.current = requestId;
    setCreateAdCheckingAvailability(true);
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);

    try {
      const currentAd = createAdStateRef.current;
      const result = await checkAdAvailability({
        postType: normalizeCreateAdPostType(currentAd.post_type),
        postDateFrom: currentAd.post_date_from || currentAd.post_date || "",
        postDateTo: currentAd.post_date_to || "",
        customDates: currentAd.custom_dates,
        postTime: currentAd.post_time,
        excludeAdId: currentAd.id || null,
      });

      if (requestId !== createAdAvailabilityRequestIdRef.current) {
        return result;
      }

      if (!result.available) {
        setCreateAdAvailabilityError(result.availabilityError);
        setCreateAdFullyBookedDates(result.fullyBookedDates);
      }

      return result;
    } catch (error) {
      console.error("Error checking create-ad availability:", error);
      if (requestId === createAdAvailabilityRequestIdRef.current) {
        setCreateAdAvailabilityError("Could not check availability. Please try again.");
      }
      throw error;
    } finally {
      if (requestId === createAdAvailabilityRequestIdRef.current) {
        setCreateAdCheckingAvailability(false);
      }
    }
  };

  const handleCreateAdAddCustomDate = () => {
    if (!createAdCustomDate) {
      return;
    }

    setAd((current) => {
      const existing = Array.isArray(current.custom_dates) ? current.custom_dates : [];
      const exists = existing.some((entry) => {
        const existingDate =
          typeof entry === "object" && entry !== null ? entry.date : entry;
        return String(existingDate || "") === createAdCustomDate;
      });
      if (exists) {
        return current;
      }

      const timeForDate = createAdCustomTime || current.post_time || "";
      const timeWithSeconds =
        timeForDate && timeForDate.length === 5 ? `${timeForDate}:00` : timeForDate;

      return {
        ...current,
        custom_dates: [
          ...existing,
          {
            date: createAdCustomDate,
            time: timeWithSeconds,
          },
        ],
      };
    });

    setCreateAdCustomDate("");
    setCreateAdCustomTime("");
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
  };

  const handleCreateAdRemoveCustomDate = (dateToRemove) => {
    setAd((current) => {
      const existing = Array.isArray(current.custom_dates) ? current.custom_dates : [];
      return {
        ...current,
        custom_dates: existing.filter((entry) => {
          const entryDate = typeof entry === "object" && entry !== null ? entry.date : entry;
          return String(entryDate || "") !== String(dateToRemove || "");
        }),
      };
    });
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
  };

  const handleCreateAdUpdateCustomDateTime = (dateToUpdate, nextTime) => {
    const timeWithSeconds = nextTime && nextTime.length === 5 ? `${nextTime}:00` : nextTime;
    setAd((current) => {
      const existing = Array.isArray(current.custom_dates) ? current.custom_dates : [];
      return {
        ...current,
        custom_dates: existing.map((entry) => {
          const entryDate = typeof entry === "object" && entry !== null ? entry.date : entry;
          if (String(entryDate || "") !== String(dateToUpdate || "")) {
            return entry;
          }

          if (typeof entry === "object" && entry !== null) {
            return {
              ...entry,
              date: entryDate,
              time: timeWithSeconds,
            };
          }

          return {
            date: entryDate,
            time: timeWithSeconds,
          };
        }),
      };
    });
    setCreateAdAvailabilityError(null);
    setCreateAdFullyBookedDates([]);
  };

  const handleCreateAdAddMedia = (mediaItem) => {
    setAd((current) => ({
      ...current,
      media: [...(Array.isArray(current.media) ? current.media : []), mediaItem],
    }));
  };

  const handleCreateAdRemoveMedia = (indexToRemove) => {
    setAd((current) => ({
      ...current,
      media: (Array.isArray(current.media) ? current.media : []).filter(
        (_, index) => index !== indexToRemove,
      ),
    }));
  };

  const showCreateAdAlert = async ({ title, message: alertMessage }) => {
    appToast.warning({
      title: title || "Action required",
      description: alertMessage || "",
    });
  };

  const saveCreateAd = async (mode = "save") => {
    if (createAdSubmitting) {
      return;
    }
    const isNewAdRecord = !String(ad.id || "").trim();

    const submitToast =
      mode === "draft"
        ? {
          title: "Saving draft...",
          description: "Please wait while the draft is saved.",
        }
        : {
          title: ad.id ? "Saving ad..." : "Creating ad...",
          description:
            mode === "continue"
              ? "Please wait while the ad is saved and billing is prepared."
              : "Please wait while the ad is saved.",
        };

    setCreateAdSubmitting(true);
    setCreateAdSubmitMode(mode);
    appToast.info({
      id: CREATE_AD_SUBMIT_TOAST_ID,
      title: submitToast.title,
      description: submitToast.description,
      duration: Infinity,
    });

    try {
      await run(async () => {
        if (!String(ad.ad_name || "").trim()) {
          throw new Error("Ad title is required");
        }
        if (!ad.advertiser_id) {
          throw new Error("Advertiser is required");
        }

        const selectedPostType = normalizeCreateAdPostType(ad.post_type);
        const customDates = normalizeCustomDatesForForm(ad.custom_dates, {
          fallbackTime: ad.post_time || "",
          fallbackReminder: "15-min",
        });
        const customDateKeys = customDates.map((entry) => entry.date).filter(Boolean);
        const paymentMode =
          ad.payment_mode ||
          (String(ad.payment || "").toLowerCase() === "paid"
            ? "Paid"
            : ad.price
              ? "Custom Amount"
              : "TBD");
        const normalizedStatus = String(ad.status || "").trim().toLowerCase();
        const shouldAutoSchedule = mode !== "draft" && (!normalizedStatus || normalizedStatus === "draft");
        const resolvedStatus =
          mode === "draft" ? "Draft" : shouldAutoSchedule ? "Scheduled" : ad.status || "Draft";

        const payload = {
          ...ad,
          post_type: toCreateAdPostTypeValue(selectedPostType),
          payment_mode: paymentMode,
          payment: paymentMode === "Paid" ? "Paid" : "Unpaid",
          status: resolvedStatus,
          custom_dates: customDates,
        };

        if (selectedPostType === "Daily Run") {
          payload.post_date = payload.post_date_from || payload.post_date || "";
        } else if (selectedPostType === "Custom Schedule") {
          payload.post_date = customDateKeys[0] || "";
        } else {
          payload.post_date = payload.post_date || payload.post_date_from || "";
          payload.post_date_from = payload.post_date;
          payload.post_date_to = "";
          payload.custom_dates = [];
        }

        if (mode !== "draft" && !String(payload.placement || "").trim()) {
          throw new Error("Placement is required");
        }

        if (mode !== "draft" && selectedPostType === "One-Time Post") {
          if (!String(payload.post_date || "").trim()) {
            throw new Error("Post date is required");
          }
          if (!String(payload.post_time || "").trim()) {
            throw new Error("Post time is required");
          }
        }

        if (mode !== "draft" && selectedPostType === "Daily Run") {
          if (!String(payload.post_date_from || "").trim()) {
            throw new Error("Start date is required");
          }
          if (!String(payload.post_date_to || "").trim()) {
            throw new Error("End date is required");
          }
          if (payload.post_date_to < payload.post_date_from) {
            throw new Error("End date must be on or after the start date");
          }
        }

        if (mode !== "draft" && selectedPostType === "Custom Schedule" && customDateKeys.length === 0) {
          throw new Error("Add at least one custom date");
        }

        const availability = await checkAdAvailability({
          postType: selectedPostType,
          postDateFrom: payload.post_date_from || payload.post_date || "",
          postDateTo: payload.post_date_to || "",
          customDates: payload.custom_dates,
          postTime: payload.post_time,
          excludeAdId: payload.id || null,
        });

        if (!availability.available) {
          setCreateAdAvailabilityError(availability.availabilityError);
          setCreateAdFullyBookedDates(availability.fullyBookedDates);
          throw new Error(availability.availabilityError || "Selected dates are unavailable.");
        }

        const savedAd = await upsertAd(payload);
        const shouldNotifyAdCreated = isInternalUserRole && isNewAdRecord && mode !== "draft";
        let approvalEmailResult = null;

        if (shouldNotifyAdCreated) {
          emitSubmissionNotificationSignal({
            source: ADMIN_CREATED_AD_NOTIFICATION_SOURCE,
            id: savedAd?.id || payload.id || "",
          });
        }

        const shouldSendApprovalNotices =
          isAdmin && shouldNotifyAdCreated && mode !== "continue";
        if (shouldSendApprovalNotices) {
          const accountInviteResult = await ensureAdvertiserAccountInvite(
            payload.advertiser_id || savedAd?.advertiser_id,
          );
          if (accountInviteResult?.email_sent) {
            appToast.success({
              title: "Advertiser account email sent.",
              description: `Sent to ${accountInviteResult.email || "the advertiser email"}.`,
            });
          } else if (accountInviteResult?.error) {
            appToast.warning({
              title: "Ad saved, but account email was not sent.",
              description: accountInviteResult.error,
            });
          }

          approvalEmailResult = await sendApprovedAdNoticeEmail({
            adRecord: savedAd,
            advertiserId: payload.advertiser_id || savedAd?.advertiser_id,
          });
          if (approvalEmailResult?.success) {
            appToast.success({
              title:
                approvalEmailResult?.notice_type === "covered_by_credits"
                  ? "Covered-by-credits email sent."
                  : "Ready-for-payment email sent.",
              description: `Sent to ${approvalEmailResult.email || "the advertiser email"}.`,
            });
          } else if (approvalEmailResult?.error) {
            appToast.warning({
              title: "Ad saved, but ready-for-payment email was not sent.",
              description: approvalEmailResult.error,
            });
          }
        }

        const shouldNotifyLifecycle =
          isInternalUserRole && mode !== "draft" && mode !== "continue";
        const skipLifecycleNotification =
          isAdmin && shouldNotifyAdCreated && approvalEmailResult?.success;

        if (shouldNotifyLifecycle && !skipLifecycleNotification) {
          const lifecycleResult = await sendAdLifecycleNotification({
            event: isNewAdRecord ? "created" : "updated",
            adRecord: savedAd,
            fallbackPayload: payload,
          });

          if (lifecycleResult?.error) {
            appToast.warning({
              title: "Ad saved, but Telegram/email internal alert failed.",
              description: lifecycleResult.error,
            });
          }
        }

        let refreshedInvoices = invoices;
        if (
          hasSupabaseConfig &&
          (approvalEmailResult?.invoice_id ||
            approvalEmailResult?.invoice?.id ||
            savedAd?.paid_via_invoice_id ||
            savedAd?.invoice_id ||
            payload.paid_via_invoice_id ||
            payload.invoice_id)
        ) {
          const refreshedDb = await refreshDbFromSupabase();
          refreshedInvoices = Array.isArray(refreshedDb?.invoices) ? refreshedDb.invoices : [];
        }

        if (mode === "continue") {
          setBillingComposerMode("invoice");
          const linkedInvoiceId =
            savedAd?.paid_via_invoice_id ||
            savedAd?.invoice_id ||
            payload.paid_via_invoice_id ||
            payload.invoice_id ||
            approvalEmailResult?.invoice_id ||
            null;
          const linkedInvoiceFromState = linkedInvoiceId
            ? refreshedInvoices.find((item) => String(item.id) === String(linkedInvoiceId))
            : null;
          const linkedInvoice = linkedInvoiceFromState || approvalEmailResult?.invoice || null;

          if (linkedInvoice) {
            setInvoice({
              ...createBlankInvoice(),
              ...linkedInvoice,
              issue_date: getTodayInAppTimeZone(),
              status: normalizeInvoiceStatus(linkedInvoice.status),
              advertiser_id: linkedInvoice.advertiser_id || payload.advertiser_id || "",
              ad_ids: Array.isArray(linkedInvoice.ad_ids)
                ? linkedInvoice.ad_ids
                : savedAd?.id
                  ? [savedAd.id]
                  : [],
            });
          } else {
            const invoiceUnitPrice = Number(savedAd?.price || payload.price || 0) || 0;
            const derivedInvoiceItems = buildInvoiceItemsFromAd({
              adRecord: savedAd || payload,
              unitPrice: invoiceUnitPrice,
            });
            const derivedInvoiceTotal = derivedInvoiceItems.reduce(
              (sum, item) => sum + (Number(item.amount ?? item.unit_price ?? 0) || 0),
              0,
            );
            setInvoice({
              ...createBlankInvoice(),
              advertiser_id: payload.advertiser_id || "",
              amount: derivedInvoiceTotal || invoiceUnitPrice || "",
              total: derivedInvoiceTotal || invoiceUnitPrice || "",
              items: derivedInvoiceItems,
              ad_ids: savedAd?.id ? [savedAd.id] : [],
            });
          }
          setActiveSection("Billing");
          setView("newInvoice");
        } else {
          setView("list");
        }

        setAd(blankAd);
        setCreateAdCustomDate("");
        setCreateAdCustomTime("");
        setCreateAdAvailabilityError(null);
        setCreateAdFullyBookedDates([]);
      }, mode === "continue" ? "Ad saved. Continue to billing." : "Ad saved.");
    } finally {
      appToast.dismiss(CREATE_AD_SUBMIT_TOAST_ID);
      setCreateAdSubmitting(false);
      setCreateAdSubmitMode("");
    }
  };

  const selectedCreateAdPostType = normalizeCreateAdPostType(ad.post_type);
  const createAdPaymentMode =
    ad.payment_mode ||
    (String(ad.payment || "").toLowerCase() === "paid"
      ? "Paid"
      : ad.price
        ? "Custom Amount"
        : "TBD");
  const createAdRequiresBilling = useMemo(
    () => normalizeAdsPayment(ad.payment_raw || ad.payment) !== "Paid",
    [ad.payment, ad.payment_raw],
  );
  const createAdPrimaryLabel = useMemo(() => {
    if (createAdSubmitting) {
      if (createAdSubmitMode === "continue") {
        return ad.id ? "Opening billing..." : "Continuing...";
      }
      if (createAdSubmitMode === "draft") {
        return "Saving draft...";
      }
      return "Saving...";
    }

    if (ad.id) {
      return createAdRequiresBilling ? "Go to billing" : "Save";
    }

    return "Continue to billing";
  }, [ad.id, createAdRequiresBilling, createAdSubmitMode, createAdSubmitting]);
  const createAdPreviewData = useMemo(() => {
    const advertiserName =
      advertisers.find((item) => item.id === ad.advertiser_id)?.advertiser_name || "";
    return {
      ...ad,
      advertiser_name: advertiserName,
      post_date_from: ad.post_date_from || ad.post_date || "",
      ad_text: ad.ad_text || ad.notes || "",
      media: Array.isArray(ad.media) ? ad.media : [],
    };
  }, [ad, advertisers]);

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

  const handleSendAdToAdminWhatsApp = async (adItem) => {
    const messageText = buildAdsShareMessage(adItem);
    const mediaItem = getPrimaryAdsShareMedia(adItem);

    if (!String(messageText || "").trim() && !mediaItem) {
      appToast.warning({
        title: "Nothing to send",
        description: "This ad does not have any media or ad copy yet.",
      });
      return;
    }

    try {
      const response = await fetchWithSessionAuth("/api/admin/send-test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_template: false,
          text: messageText,
          media: mediaItem
            ? {
                type: mediaItem.type,
                url: mediaItem.url || mediaItem.cdnUrl,
              }
            : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to send");
      }
      const recipient = String(data?.to || "").trim();
      const messageId = String(data?.message_id || "").trim();
      const warning = String(data?.warning || "").trim();
      const sendMode = String(data?.send_mode || "").trim();
      const deliveryNote =
        sendMode && sendMode !== "text" ? ` Mode: ${sendMode}.` : " Delivery may still be pending.";
      appToast.success({
        title: "Ad accepted by admin WhatsApp channel.",
        description: warning
          ? `${recipient ? `To: ${recipient}. ` : ""}${warning}${messageId ? ` Meta ID: ${messageId}` : ""}`
          : `${recipient ? `To: ${recipient}. ` : ""}${messageId ? `Meta ID: ${messageId}.` : ""}${deliveryNote}`,
      });
    } catch (err) {
      appToast.error({
        title: "Failed to send to admin WhatsApp",
        description: err.message,
      });
    }
  };

  const handleSendAdToMyTelegram = async (adItem) => {
    const activeChatIds = settingsTelegramChatIds
      .filter((item) => item.is_active !== false && String(item.chat_id || "").trim())
      .map((item) => String(item.chat_id).trim());

    if (activeChatIds.length === 0) {
      appToast.warning({
        title: "Telegram Chat ID missing",
        description: "Please add at least one Telegram Chat ID in Settings > Notifications first.",
      });
      return;
    }

    const messageText = buildAdsTelegramCaption(adItem);
    const mediaItem = getPrimaryAdsShareMedia(adItem);

    if (!messageText && !mediaItem) {
      appToast.warning({
        title: "Nothing to send",
        description: "This ad does not have any media or ad copy yet.",
      });
      return;
    }

    try {
      const response = await fetchWithSessionAuth("/api/admin/telegram/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_ids: activeChatIds,
          text: messageText,
          parse_mode: null,
          media: mediaItem
            ? {
                type: mediaItem.type,
                url: mediaItem.url || mediaItem.cdnUrl,
              }
            : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to send");
      appToast.success({
        title: `Ad sent to ${activeChatIds.length} Telegram chat${activeChatIds.length !== 1 ? "s" : ""}.`,
      });
    } catch (err) {
      appToast.error({
        title: "Failed to send to Telegram",
        description: err.message,
      });
    }
  };

  const markAdAsPublished = (adId) => {
    if (!isAdmin) {
      return;
    }
    return run(async () => {
      await updateAdStatus(adId, "Published");
      const latestAd = readDb().ads.find(
        (item) => String(item?.id || "") === String(adId || ""),
      );
      const lifecycleResult = await sendAdLifecycleNotification({
        event: "published",
        adRecord: latestAd,
      });
      if (lifecycleResult?.error) {
        appToast.warning({
          title: "Ad published, but internal alert failed.",
          description: lifecycleResult.error,
        });
      }
    }, "Ad marked as published.");
  };

  const deleteAdRecord = async (adId) => {
    if (!canDeleteAds) {
      appToast.error({
        title: "You do not have permission to delete ads.",
      });
      return;
    }

    const normalizedAdId = String(adId || "").trim();
    if (!normalizedAdId || pendingAdDeleteIdsRef.current.has(normalizedAdId)) {
      return;
    }

    pendingAdDeleteIdsRef.current.add(normalizedAdId);
    setPendingAdDeleteIds((current) =>
      current.includes(normalizedAdId) ? current : [...current, normalizedAdId],
    );
    setAdsPreviewAd((current) =>
      String(current?.id || "").trim() === normalizedAdId ? null : current,
    );

    const toastId = `delete-ad-${normalizedAdId}`;
    const adBeforeDelete = ads.find(
      (item) => String(item?.id || "").trim() === normalizedAdId,
    );
    appToast.info({
      id: toastId,
      title: "Deleting ad...",
      description: "Please wait while the ad is removed.",
      duration: Infinity,
    });

    try {
      await deleteAd(normalizedAdId);
      setDb(readDb());
      const lifecycleResult = await sendAdLifecycleNotification({
        event: "deleted",
        adRecord: adBeforeDelete,
      });
      if (lifecycleResult?.error) {
        appToast.warning({
          title: "Ad deleted, but internal alert failed.",
          description: lifecycleResult.error,
        });
      }
      appToast.success({
        title: "Ad deleted.",
      });
    } catch (error) {
      console.error("[AdsPage] Delete ad failed", error);
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to delete ad",
      });
    } finally {
      appToast.dismiss(toastId);
      pendingAdDeleteIdsRef.current.delete(normalizedAdId);
      setPendingAdDeleteIds((current) =>
        current.filter((itemId) => itemId !== normalizedAdId),
      );
    }
  };

  const handleToggleSelectAd = (adId) => {
    setSelectedAdIds((prev) => {
      const next = new Set(prev);
      next.has(String(adId)) ? next.delete(String(adId)) : next.add(String(adId));
      return next;
    });
  };

  const handleSelectAllAds = () => {
    const allIds = paginatedAds.map((a) => String(a.id));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedAdIds.has(id));
    setSelectedAdIds(allSelected ? new Set() : new Set(allIds));
  };

  const executeBatchDelete = async (adIds) => {
    const toastId = "batch-delete-ads";
    appToast.info({ id: toastId, title: "Deleting ads...", duration: Infinity });
    try {
      const res = await fetchWithSessionAuth("/api/ads/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", adIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete ads.");
      if (hasSupabaseConfig) {
        invalidateDbCache();
        await ensureDb();
      }
      setDb(readDb());
      setSelectedAdIds(new Set());
      appToast.success({ title: "Ads deleted", description: data.message });
    } catch (error) {
      console.error("[AdsPage] Batch delete failed", error);
      appToast.error({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete ads.",
      });
    } finally {
      appToast.dismiss(toastId);
    }
  };

  const handleBatchDelete = () => {
    if (selectedAdIds.size === 0) return;
    const ids = [...selectedAdIds];
    appToast.warning({
      id: "confirm-batch-delete-ads",
      title: `Delete ${ids.length} ad${ids.length > 1 ? "s" : ""}?`,
      description: "This cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => {
          void executeBatchDelete(ids);
        },
      },
    });
  };

  const handleNavigate = (section) => {
    if (!allowedSections.includes(section)) {
      return;
    }
    setActiveSection(section);
    setView("list");
    setAd(blankAd);
    setProduct(blankProduct);
    setInvoice(createBlankInvoice());
    setAdvertiserCreateOpen(false);
    setProductCreateOpen(false);
    setOpenProductMenuId(null);
    setProductEditModal(null);
    setProductDeleteModal(null);
    setOpenInvoiceMenuId(null);
    setShowInvoiceCreateMenu(false);
    setInvoicePreviewModal(null);
    setShowProfileDropdown(false);
    if (section === "Ads") {
      setAdsUnreadCount(0);
    }
  };



  const openAdvertiserMenu = (advertiserId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 124;
    const gap = 6;
    const viewportPadding = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - menuHeight - viewportPadding),
    );

    let left = rect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding),
    );

    setAdvertiserMenuCoordinates({
      top,
      left,
    });
    setOpenAdvertiserMenuId((current) =>
      current === advertiserId ? null : advertiserId,
    );
  };

  const buildAdvertiserViewModalState = (item, dbValue = db) => {
    const advertiserAds = (dbValue?.ads || []).filter(
      (adItem) =>
        adItem.advertiser_id === item.id ||
        (!adItem.advertiser_id &&
          String(adItem.advertiser || "") === String(item.advertiser_name || "")),
    );

    return {
      advertiser: {
        ...item,
        contact_name: item.contact_name || item.business_name || "\u2014",
        phone_number: formatUSPhoneNumber(item.phone_number || item.phone || ""),
        total_spend: Number(item.total_spend ?? item.ad_spend ?? 0) || 0,
        credits: Number(item.credits || 0) || 0,
        status: item.status || "active",
      },
      ads: advertiserAds.map((adItem) => ({
        ...adItem,
        post_date_from: adItem.post_date_from || adItem.post_date || "",
      })),
    };
  };

  const openAdvertiserCreate = (source = "advertisers") => {
    setAdvertiserCreateForm({
      advertiser_name: "",
      contact_name: "",
      email: "",
      phone_number: "",
      status: "active",
    });
    setAdvertiserCreateSource(source);
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
      phone_number: formatUSPhoneNumber(item.phone_number || item.phone || ""),
      phone: formatUSPhoneNumber(item.phone || item.phone_number || ""),
      status: item.status || "active",
    });
    setOpenAdvertiserMenuId(null);
  };

  const openAdvertiserView = (item) => {
    setAdvertiserCreditsForm({
      amount: "",
      reason: "",
    });
    setAdvertiserViewModal(buildAdvertiserViewModalState(item));
    setOpenAdvertiserMenuId(null);
  };

  const closeAdvertiserCreate = () => {
    setAdvertiserCreateOpen(false);
    setAdvertiserCreateSource("advertisers");
  };

  const requestAdvertiserCreditsAdjustment = async ({
    advertiserId,
    amount,
    reason,
  }) => {
    const normalizedAdvertiserId = String(advertiserId || "").trim();
    if (!normalizedAdvertiserId) {
      throw new Error("Advertiser is required.");
    }
    if (!hasSupabaseConfig) {
      throw new Error("Supabase configuration is required to adjust credits.");
    }

    const response = await fetchWithSessionAuth(
      `/api/admin/advertisers/${normalizedAdvertiserId}/credits`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          reason,
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "Failed to update advertiser credits.");
    }

    const nextDb = await refreshDbFromSupabase();
    const updatedAdvertiser = (nextDb?.advertisers || []).find(
      (item) => String(item?.id || "") === normalizedAdvertiserId,
    );
    return { data, nextDb, updatedAdvertiser };
  };

  const applyCreditsToInvoice = async () => {
    const invoiceId = String(invoice?.id || "").trim();
    if (!invoiceId) {
      appToast.error({ title: "Save the invoice before applying credits." });
      return;
    }
    if (!hasSupabaseConfig) {
      appToast.error({ title: "Supabase configuration is required to apply credits." });
      return;
    }
    if (invoiceCreditsApplying) {
      return;
    }
    setInvoiceCreditsApplying(true);
    try {
      const response = await fetchWithSessionAuth("/api/admin/invoices/apply-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to apply credits.");
      }

      const refreshedDb = await refreshDbFromSupabase();
      const refreshedInvoice =
        (refreshedDb?.invoices || []).find(
          (item) => String(item?.id || "") === invoiceId,
        ) || null;

      if (refreshedInvoice) {
        setInvoice({
          ...createBlankInvoice(),
          ...refreshedInvoice,
          issue_date: getTodayInAppTimeZone(),
          status: normalizeInvoiceStatus(refreshedInvoice.status),
          ad_ids: toStringArray(refreshedInvoice.ad_ids),
        });
      }

      if (
        data?.applied ||
        isInvoicePaidViaCredits(data?.invoice) ||
        isInvoicePaidViaCredits(refreshedInvoice)
      ) {
        appToast.success({ title: "Invoice paid via credits." });
      } else {
        appToast.warning({
          title: "Credits were not applied.",
          description: data?.reason || "The invoice remains pending.",
        });
      }

      if (
        data?.notice &&
        data.notice.skipped !== true &&
        data.notice?.advertiser_email_sent === false
      ) {
        appToast.warning({
          title: "Credits applied, but the advertiser notice was not sent.",
          description:
            data.notice?.advertiser_email_error || "Failed to send the credit notice email.",
        });
      }
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to apply credits.",
      });
    } finally {
      setInvoiceCreditsApplying(false);
    }
  };

  const openBillingCreditsComposer = () => {
    const defaultAdvertiserId =
      String(advertiserViewModal?.advertiser?.id || "").trim() ||
      String(advertisers?.[0]?.id || "").trim() ||
      "";
    setBillingComposerMode("credit");
    setInvoice({
      ...createBlankInvoice(),
      advertiser_id: defaultAdvertiserId,
      amount: "",
      total: "",
      status: "Paid",
      notes: "",
    });
    setView("newInvoice");
    setShowInvoiceCreateMenu(false);
  };

  const adjustAdvertiserCredits = async (direction) => {
    const advertiserId = String(advertiserViewModal?.advertiser?.id || "").trim();
    if (!advertiserId || !hasSupabaseConfig) {
      return;
    }

    const absoluteAmount = Math.abs(
      Number.parseFloat(String(advertiserCreditsForm.amount || "").trim()) || 0,
    );
    const reason = String(advertiserCreditsForm.reason || "").trim();
    if (!absoluteAmount) {
      appToast.error({ title: "Enter a credit amount." });
      return;
    }
    if (!reason) {
      appToast.error({ title: "Add a reason for this credit change." });
      return;
    }

    const signedAmount = direction === "deduct" ? -absoluteAmount : absoluteAmount;
    setAdvertiserCreditsLoading(true);
    try {
      const { data, nextDb, updatedAdvertiser } = await requestAdvertiserCreditsAdjustment({
        advertiserId,
        amount: signedAmount,
        reason,
      });
      if (updatedAdvertiser) {
        setAdvertiserViewModal(buildAdvertiserViewModalState(updatedAdvertiser, nextDb));
      }
      setAdvertiserCreditsForm({
        amount: "",
        reason: "",
      });
      appToast.success({
        title: direction === "deduct" ? "Credits deducted." : "Credits added.",
        description:
          direction !== "deduct" && data?.credit_invoice?.invoice_number
            ? `Recorded as ${data.credit_invoice.invoice_number}.`
            : undefined,
      });
    } catch (error) {
      appToast.error({
        title:
          error instanceof Error ? error.message : "Failed to update advertiser credits.",
      });
    } finally {
      setAdvertiserCreditsLoading(false);
    }
  };

  const saveAdvertiserModal = async () => {
    if (!advertiserEditModal) {
      return;
    }

    if (
      advertiserEditModal.phone_number &&
      !isCompleteUSPhoneNumber(advertiserEditModal.phone_number)
    ) {
      appToast.error({ title: "Phone number must be a complete US number." });
      return;
    }

    setAdvertiserActionLoading(true);
    try {
      if (!String(advertiserEditModal.advertiser_name || "").trim()) {
        throw new Error("Advertiser name required");
      }

      await upsertAdvertiser({
        ...advertiserEditModal,
        phone: formatUSPhoneNumber(
          advertiserEditModal.phone_number || advertiserEditModal.phone || "",
        ),
      });
      setDb(readDb());
      appToast.success({ title: "Advertiser saved." });
      setAdvertiserEditModal(null);
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to save advertiser",
      });
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
      appToast.success({ title: "Advertiser deleted." });
      setAdvertiserDeleteModal(null);
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to delete advertiser",
      });
    } finally {
      setAdvertiserActionLoading(false);
    }
  };

  const saveNewAdvertiser = async (type) => {
    if (type === "cancel") {
      closeAdvertiserCreate();
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
      if (
        advertiserCreateForm.phone_number &&
        !isCompleteUSPhoneNumber(advertiserCreateForm.phone_number)
      ) {
        throw new Error("Phone number must be a complete US number");
      }

      const savedAdvertiser = await upsertAdvertiser({
        ...advertiserCreateForm,
        phone: formatUSPhoneNumber(advertiserCreateForm.phone_number || ""),
        phone_number: formatUSPhoneNumber(advertiserCreateForm.phone_number || ""),
      });
      setDb(readDb());
      appToast.success({ title: "Advertiser saved." });
      if (advertiserCreateSource === "createAd" && savedAdvertiser?.id) {
        setAd((current) => ({
          ...current,
          advertiser_id: savedAdvertiser.id,
        }));
      }
      closeAdvertiserCreate();
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to create advertiser",
      });
    } finally {
      setAdvertiserCreateLoading(false);
    }
  };

  const openProductMenu = (productId, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 108;
    const gap = 6;
    const viewportPadding = 8;

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
    }
    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - menuHeight - viewportPadding),
    );

    let left = rect.right - menuWidth;
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuWidth - viewportPadding),
    );

    setProductMenuCoordinates({
      top,
      left,
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
      appToast.success({ title: "Product saved." });
      setProduct(blankProduct);
      setProductCreateOpen(false);
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to create product",
      });
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
      appToast.success({ title: "Product updated." });
      setProductEditModal(null);
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to update product",
      });
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
      appToast.success({ title: "Product deleted." });
      setProductDeleteModal(null);
    } catch (error) {
      appToast.error({
        title: error instanceof Error ? error.message : "Failed to delete product",
      });
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

  if (!["admin", "manager", "staff", "advertiser"].includes(userRole)) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Access Denied
          </h1>
          <p className="text-gray-600 mb-6">
            You do not have access to this page.
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
      <Sidebar
        activeItem={activeSection}
        onNavigate={handleNavigate}
        userRole={userRole}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        unreadCount={unreadCount}
        onMarkAllAsRead={markAllAsRead}
        adsUnreadCount={adsUnreadCount}
        onClearAdsUnread={() => setAdsUnreadCount(0)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {view === "list" && (
          <header className="h-16 border-b border-gray-200 flex items-center justify-between px-4 md:px-8 gap-4 flex-shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center justify-center p-2 hover:bg-gray-100 rounded-lg md:hidden"
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative" ref={notificationsDropdownRef}>
                <button
                  className="relative p-2 hover:bg-gray-100 rounded-lg"
                  type="button"
                  onClick={() => setShowNotificationsDropdown((current) => !current)}
                >
                  <Bell size={20} className="text-gray-600" />
                  {totalUnreadCount > 0 ? (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#ED1D26] px-1 text-[10px] font-semibold text-white flex items-center justify-center">
                      {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                    </span>
                  ) : null}
                </button>

                {showNotificationsDropdown ? (
                  <div className="absolute right-0 mt-2 w-[320px] rounded-xl border border-gray-200 bg-white p-4 shadow-xl z-50">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Notifications</p>
                        <p className="text-xs text-gray-500">Recent app activity</p>
                      </div>
                      {totalUnreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await markAllAsRead();
                            setAdsUnreadCount(0);
                          }}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900"
                        >
                          Mark all read
                        </button>
                      ) : null}
                    </div>

                    {totalUnreadCount > 0 ? (
                      <div className="space-y-2">
                        {adsUnreadCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAdsUnreadCount(0);
                              setShowNotificationsDropdown(false);
                              setActiveSection("Ads");
                              setView("list");
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100 transition-colors"
                          >
                            <p className="text-sm font-semibold text-gray-900">
                              New ad created in dashboard
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Click to review recent ads.
                            </p>
                          </button>
                        ) : null}
                        {unreadCount > 0 ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await markAllAsRead();
                              await openSubmissionsFromNotification();
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100 transition-colors"
                          >
                            <p className="text-sm font-semibold text-gray-900">
                              New ad submission received
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Click to review pending submissions.
                            </p>
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                        No new notifications
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

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
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleNavigate("Settings")}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full text-left"
                        >
                          <Settings size={16} />
                          Profile Settings
                        </button>
                        <div className="border-t border-gray-100 my-1" />
                      </>
                    ) : null}
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
            </div>
          </header>
        )}

        <main
          className={`flex-1 overflow-auto bg-gray-50 ${activeSection === "Calendar" ? "p-0" : "p-8"
            }`}
        >
          {activeSection === "Dashboard" && (
            <div className="max-w-7xl mx-auto">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-gray-600 mt-1">
                    {isAdvertiser
                      ? "Overview of your advertiser account activity"
                      : "Overview of your ad management"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Active Ads
                    </p>
                    <DashboardStatTooltipIcon
                      icon={Calendar}
                      tooltip="Total ads currently in your pipeline."
                    />
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
                    <DashboardStatTooltipIcon
                      icon={Clock3}
                      tooltip="New ad submissions waiting for review and approval."
                    />
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
                    <DashboardStatTooltipIcon
                      icon={AlertCircle}
                      tooltip="Total unpaid invoice balance across approved ads."
                    />
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
                    <DashboardStatTooltipIcon
                      icon={TrendingUp}
                      tooltip="Revenue collected from ads marked paid this month."
                    />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(dashboardStats.monthRevenue)}
                  </p>
                </div>
              </div>

              {isAdmin && capacityWarnings.length > 0 && (
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
                                {advertisers.find(
                                  (adv) => String(adv.id || "") === String(item.advertiser_id || ""),
                                )
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

              {isAdmin ? (
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
              ) : null}

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
                          {formatPostTypeLabel(dashboardInsights.mostPopularType)}
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

          {activeSection === "Create Ad" && isAdvertiser && (
            <AdvertiserCreateAdSection
              advertiser={currentAdvertiser}
              products={products}
              user={user}
              fetchWithSessionAuth={fetchWithSessionAuth}
              onBack={() => setActiveSection("Dashboard")}
              onSubmitted={handleAdvertiserSubmissionCreated}
            />
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
                          placeholder="Search ads or invoice #..."
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
                  getStatusClass={getCalendarStatusColor}
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
                  canEdit={isAdmin}
                />
              ) : null}
            </div>
          )}

          {activeSection === "Submissions" && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900 mb-1">Submissions</h1>
                <p className="text-sm text-gray-500">
                  {isAdvertiser
                    ? "Track the ad requests submitted under your advertiser account."
                    : "Review and approve advertising requests from clients"}
                </p>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {!ready ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-3" />
                    <p className="text-sm font-medium">Loading submissions...</p>
                  </div>
                ) : filteredPendingSubmissions.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No submissions</div>
                ) : (
                  <>
                    {canBatchDeleteSubmissions && selectedSubmissionIds.size > 0 && (
                      <div className="mx-4 mt-4 mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                        <span className="text-sm text-gray-700 font-medium">
                          {selectedSubmissionIds.size} submission
                          {selectedSubmissionIds.size > 1 ? "s" : ""} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedSubmissionIds(new Set())}
                          className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          Clear
                        </button>
                        <div className="ml-auto">
                          <button
                            type="button"
                            onClick={handleBatchDeleteSubmissions}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={13} />
                            Delete {selectedSubmissionIds.size} submission
                            {selectedSubmissionIds.size > 1 ? "s" : ""}
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {canBatchDeleteSubmissions && (
                              <th className="px-6 py-3 text-left w-10">
                                <input
                                  type="checkbox"
                                  checked={
                                    filteredPendingSubmissions.length > 0 &&
                                    filteredPendingSubmissions.every((item) =>
                                      selectedSubmissionIds.has(String(item.id || "").trim()),
                                    )
                                  }
                                  onChange={handleSelectAllSubmissions}
                                  className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                                />
                              </th>
                            )}
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
                            Reason
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Post Type
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase">
                            Submitted
                          </th>
                          <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-700 uppercase sticky right-0 bg-gray-50 shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.04)]">
                            Actions
                          </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredPendingSubmissions.map((item) => {
                            return (
                              <tr
                                key={item.id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={(event) => handleSubmissionRowClick(event, item)}
                              >
                                {canBatchDeleteSubmissions && (
                                  <td className="px-6 py-3.5">
                                    <input
                                      type="checkbox"
                                      checked={selectedSubmissionIds.has(String(item.id || "").trim())}
                                      onChange={() => handleToggleSelectSubmission(item.id)}
                                      data-stop-submission-row-click="true"
                                      className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                                    />
                                  </td>
                                )}
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
                              <span
                                className="block max-w-[220px] truncate"
                                title={String(item.review_notes || "").trim() || getSubmissionReasonPreview(item)}
                              >
                                {getSubmissionReasonPreview(item)}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs whitespace-nowrap">
                              {formatPostTypeLabel(item.post_type) || "-"}
                            </td>
                            <td className="px-6 py-3.5 text-gray-600 text-xs">
                              {formatSubmissionDate(item.created_at)}
                            </td>
                            <td className="px-6 py-3.5 sticky right-0 bg-white shadow-[-8px_0_8px_-4px_rgba(0,0,0,0.04)]">
                              <div className="flex gap-2">
                                {isAdvertiser &&
                                String(item?.status || "").toLowerCase() === "pending" ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-900"
                                    title="Edit pending submission"
                                    aria-label="Edit pending submission"
                                    onClick={() => openSubmissionEditModal(item)}
                                  >
                                    <Pencil size={16} />
                                    <span>Edit</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                                    title="Review submission"
                                    onClick={() => openSubmissionEditModal(item)}
                                  >
                                    <Eye size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
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
                      WhatsApp Hub
                    </h1>
                    <p className="text-gray-600 mt-2">
                      Manage inbox, recipients, and delivery settings in one place.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {whatsAppUnreadCount > 0 && (
                      <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
                        {whatsAppUnreadCount} unread
                      </div>
                    )}
                    <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
                      {whatsAppActiveRecipientCount} active recipient
                      {whatsAppActiveRecipientCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">Webhook is active</p>
                    <p className="text-xs text-green-700 mt-0.5">The WhatsApp webhook endpoint is configured and receiving messages.</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  {[
                    { id: "inbox", label: "Inbox" },
                    { id: "recipients", label: "Recipients" },
                    { id: "settings", label: "Settings" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWhatsAppAdminTab(tab.id)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        whatsAppAdminTab === tab.id
                          ? "bg-gray-900 text-white"
                          : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {whatsAppAdminTab === "inbox" && (
                <>
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
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          whatsAppFilterUnread
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
                          onClick={() =>
                            handleConfirmWhatsAppDelete(selectedWhatsAppMessage.id)
                          }
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
                </>
              )}

              {whatsAppAdminTab === "recipients" && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Admin Recipients</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Active recipients receive ad shares from the Ads section.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleWhatsAppTestAllActiveRecipients}
                      disabled={whatsAppBulkTesting}
                      className="px-3 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {whatsAppBulkTesting ? "Sending..." : "Test Active Recipients"}
                    </button>
                  </div>

                  {whatsAppRecipients.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                      No WhatsApp recipients yet. Add one below to start routing messages.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {whatsAppRecipients.map((item) => {
                        const recipientId = String(item.id || item.phone_e164 || "");
                        const isActive = item.is_active !== false;
                        const isTesting = whatsAppRecipientTesting === recipientId;
                        return (
                          <div
                            key={recipientId}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                              isActive
                                ? "bg-white border-gray-200"
                                : "bg-gray-50 border-gray-200 opacity-60"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleWhatsAppToggleRecipient(recipientId, !isActive)}
                              className={`flex items-center justify-center w-5 h-5 rounded border-2 transition-colors ${
                                isActive
                                  ? "bg-gray-900 border-gray-900"
                                  : "bg-white border-gray-300"
                              }`}
                            >
                              {isActive ? <Check size={14} className="text-white" /> : null}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {item.label || item.phone_e164}
                              </p>
                              <p className="text-xs text-gray-500 font-mono">{item.phone_e164}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleWhatsAppTestRecipient(item)}
                              disabled={isTesting}
                              className="px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                              {isTesting ? "Sending..." : "Test"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWhatsAppDeleteRecipient(recipientId)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-sm font-medium text-gray-900 mb-3">Add Recipient</p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="min-w-[220px] flex-1">
                        <input
                          type="text"
                          placeholder="Label (e.g. Admin Phone)"
                          value={whatsAppNewRecipientLabel}
                          onChange={(event) => setWhatsAppNewRecipientLabel(event.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                        />
                      </div>
                      <div className="min-w-[220px] flex-1">
                        <input
                          type="text"
                          placeholder="Phone (e.g. +15551234567)"
                          value={whatsAppNewRecipientPhone}
                          onChange={(event) => setWhatsAppNewRecipientPhone(event.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleWhatsAppAddRecipient}
                        disabled={
                          whatsAppRecipientAdding ||
                          !whatsAppNewRecipientLabel.trim() ||
                          !whatsAppNewRecipientPhone.trim()
                        }
                        className="px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                      >
                        <Plus size={14} />
                        {whatsAppRecipientAdding ? "Adding..." : "Add"}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Use international E.164 format with `+` and country code.
                    </p>
                  </div>
                </div>
              )}

              {whatsAppAdminTab === "settings" && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Channel Settings</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Configure how ad notifications are sent through WhatsApp.
                    </p>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={whatsAppSettingsDraft.enabled}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Enable channel</p>
                          <p className="text-xs text-gray-500">
                            Keep WhatsApp routing available in admin actions.
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={whatsAppSettingsDraft.include_media}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              include_media: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Include media</p>
                          <p className="text-xs text-gray-500">
                            Send media attachments (image, video, audio, document) when available.
                          </p>
                        </div>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={whatsAppSettingsDraft.use_template_fallback}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              use_template_fallback: event.target.checked,
                            }))
                          }
                          className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Template fallback</p>
                          <p className="text-xs text-gray-500">
                            Use approved templates when free-text delivery is limited.
                          </p>
                        </div>
                      </label>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Default send mode
                        </label>
                        <select
                          value={whatsAppSettingsDraft.send_mode}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              send_mode: event.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="text">Text first</option>
                          <option value="template">Template only</option>
                          <option value="auto">Auto</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Template name
                        </label>
                        <input
                          type="text"
                          placeholder="hello_world"
                          value={whatsAppSettingsDraft.template_name}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              template_name: event.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Template language
                        </label>
                        <input
                          type="text"
                          placeholder="en_US"
                          value={whatsAppSettingsDraft.template_language}
                          onChange={(event) =>
                            setWhatsAppSettingsDraft((current) => ({
                              ...current,
                              template_language: event.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-700">Saved profile snapshot</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Mode: <span className="font-mono">{whatsAppPersistedSettings.send_mode}</span>
                          {" | "}
                          Media:{" "}
                          <span className="font-mono">
                            {whatsAppPersistedSettings.include_media ? "on" : "off"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handleWhatsAppSaveSettings}
                      disabled={whatsAppSettingsSaving}
                      className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {whatsAppSettingsSaving ? "Saving..." : "Save Settings"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setWhatsAppSettingsDraft(
                          createDefaultWhatsAppSettingsDraft(
                            notificationPreferences.whatsapp_settings,
                          ),
                        )
                      }
                      disabled={whatsAppSettingsSaving}
                      className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "Ads" && view === "list" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">Ads</h1>
                <p className="text-sm text-gray-500">
                  {isAdvertiser
                    ? "Review the ads linked to your advertiser account."
                    : "Monitor active campaigns, review creative content, and track deployment statuses."}
                </p>
              </div>

              <div className="flex items-center mb-6 gap-3 min-w-0">
                <div className="flex items-center gap-3 shrink-0">
                  <select
                    value={adsFilters.status}
                    onChange={(event) =>
                      setAdsFilters((current) => ({ ...current, status: event.target.value }))
                    }
                    className="w-[138px] px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 appearance-none cursor-pointer transition-all"
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
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${adsFilters.status === "Today"
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
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${adsFilters.status === "This Week"
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
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all flex items-center gap-2"
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
                </div>
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {/* View Mode Toggle */}
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setAdsViewMode("grid")}
                      className={`p-1.5 rounded-md transition-colors ${adsViewMode === "grid" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      title="Grid View"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => setAdsViewMode("list")}
                      className={`p-1.5 rounded-md transition-colors ${adsViewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      title="List View"
                    >
                      <List size={16} />
                    </button>
                  </div>
                  <div className="relative w-[clamp(170px,18vw,230px)]">
                    <Search
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search ads or invoice #..."
                      value={adsFilters.search}
                      onChange={(event) =>
                        setAdsFilters((current) => ({
                          ...current,
                          search: event.target.value,
                        }))
                      }
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                    />
                  </div>
                  <button
                    onClick={exportVisibleAdsCsv}
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all flex items-center gap-2"
                    type="button"
                  >
                    <Download size={16} />
                    Export
                  </button>
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        setAd(blankAd);
                        setView("createAd");
                      }}
                      className="h-11 min-w-[132px] px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all flex items-center justify-center whitespace-nowrap shrink-0"
                      type="button"
                    >
                      Create new ad
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mb-4 text-sm text-gray-600">
                {sortedAds.length === 0
                  ? "Showing 0 ads"
                  : `Showing ${adsPageStartIndex}-${adsPageEndIndex} of ${sortedAds.length} ads`}
              </div>

              {sortedAds.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
                  <p className="text-gray-500">No ads found</p>
                  {isAdmin ? (
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
                  ) : (
                    <p className="mt-2 text-sm text-gray-400">
                      Ads submitted under your account will appear here.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {canDeleteAds && selectedAdIds.size > 0 && (
                    <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                      <span className="text-sm text-gray-700 font-medium">
                        {selectedAdIds.size} ad{selectedAdIds.size > 1 ? "s" : ""} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedAdIds(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        Clear
                      </button>
                      <div className="ml-auto">
                        <button
                          type="button"
                          onClick={handleBatchDelete}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                          <Trash2 size={13} />
                          Delete {selectedAdIds.size} ad{selectedAdIds.size > 1 ? "s" : ""}
                        </button>
                      </div>
                    </div>
                  )}

                  {adsViewMode === "list" ? (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto">
                      <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          {canDeleteAds && (
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={paginatedAds.length > 0 && paginatedAds.every((a) => selectedAdIds.has(String(a.id)))}
                                onChange={handleSelectAllAds}
                                className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                              />
                            </th>
                          )}
                          <AdsSortableHeader
                            label="Invoice #"
                            sortKey="invoice_number"
                            sortConfig={adsSortConfig}
                            onSort={handleAdsSort}
                          />
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
                        {paginatedAds.map((item) => (
                          <AdsTableRow
                            key={item.id}
                            ad={item}
                            onPreview={setAdsPreviewAd}
                            onEdit={openAdEditor}
                            onMarkPublished={markAdAsPublished}
                            onDelete={deleteAdRecord}
                            onSendToWhatsApp={handleSendAdToAdminWhatsApp}
                            onSendToTelegram={handleSendAdToMyTelegram}
                            readOnly={isAdvertiser}
                            canDelete={canDeleteAds}
                            isSelected={selectedAdIds.has(String(item.id))}
                            onToggleSelect={canDeleteAds ? handleToggleSelectAd : undefined}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {paginatedAds.map((item) => (
                        <AdsGridCard
                          key={item.id}
                          ad={item}
                          onPreview={setAdsPreviewAd}
                          onEdit={openAdEditor}
                          onMarkPublished={markAdAsPublished}
                          onDelete={deleteAdRecord}
                          onSendToWhatsApp={handleSendAdToAdminWhatsApp}
                          onSendToTelegram={handleSendAdToMyTelegram}
                          readOnly={isAdvertiser}
                          canDelete={canDeleteAds}
                          isSelected={selectedAdIds.has(String(item.id))}
                          onToggleSelect={canDeleteAds ? handleToggleSelectAd : undefined}
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>Rows per page</span>
                      <select
                        value={adsPageSize}
                        onChange={(event) => {
                          setAdsPageSize(Number(event.target.value) || 10);
                          setAdsCurrentPage(1);
                        }}
                        className="h-9 min-w-[72px] rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
                      >
                        {ADS_PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAdsCurrentPage((current) => Math.max(1, current - 1))}
                        disabled={adsCurrentPage <= 1}
                        className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-gray-600 min-w-[90px] text-center">
                        Page {adsCurrentPage} of {adsTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAdsCurrentPage((current) => Math.min(adsTotalPages, current + 1))
                        }
                        disabled={adsCurrentPage >= adsTotalPages}
                        className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}

              <AdsPreviewModal
                ad={adsPreviewAd}
                onClose={() => setAdsPreviewAd(null)}
                onEdit={openAdEditor}
                linkedInvoices={linkedPreviewInvoices}
                canEdit={canEditAds}
              />
            </div>
          )}
          {activeSection === "Ads" && view === "createAd" && canEditAds && (
            <div className="flex-1 overflow-auto bg-white -m-8">
              {advertiserCreateOpen && advertiserCreateSource === "createAd" ? (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4">
                  <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
                    <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">Add Advertiser</h2>
                        <p className="text-sm text-gray-500 mt-1">
                          Create the advertiser first, then continue creating the ad.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeAdvertiserCreate}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Advertiser Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={advertiserCreateForm.advertiser_name}
                          onChange={(event) =>
                            setAdvertiserCreateForm((current) => ({
                              ...current,
                              advertiser_name: event.target.value,
                            }))
                          }
                          placeholder="Enter advertiser business name"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>

                      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Contact Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={advertiserCreateForm.contact_name}
                          onChange={(event) =>
                            setAdvertiserCreateForm((current) => ({
                              ...current,
                              contact_name: event.target.value,
                            }))
                          }
                          placeholder="Enter primary contact name"
                          className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={advertiserCreateForm.email}
                            onChange={(event) =>
                              setAdvertiserCreateForm((current) => ({
                                ...current,
                                email: event.target.value,
                              }))
                            }
                            placeholder="contact@example.com"
                            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                          />
                        </div>

                        <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={advertiserCreateForm.phone_number}
                            onChange={(event) =>
                              setAdvertiserCreateForm((current) => ({
                                ...current,
                                phone_number: formatUSPhoneNumber(event.target.value),
                              }))
                            }
                            inputMode="tel"
                            autoComplete="tel-national"
                            maxLength={US_PHONE_INPUT_MAX_LENGTH}
                            placeholder="(123) 456-7890"
                            className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3">
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Account Status
                        </label>
                        <select
                          value={advertiserCreateForm.status}
                          onChange={(event) =>
                            setAdvertiserCreateForm((current) => ({
                              ...current,
                              status: event.target.value,
                            }))
                          }
                          className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                          style={adsSelectStyle}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>

                    <div className="px-6 py-5 border-t border-gray-200 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => saveNewAdvertiser("cancel")}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveNewAdvertiser("save")}
                        disabled={advertiserCreateLoading}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all disabled:opacity-50"
                      >
                        {advertiserCreateLoading ? "Saving..." : "Save Advertiser"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex max-w-none mx-auto min-h-screen">
                <div className="flex-1 bg-white px-5 py-8 sm:px-6 sm:py-10 xl:p-12 flex justify-end">
                  <div className="w-full max-w-[800px] lg:mr-8 xl:mr-12 relative">
                    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm pb-4 pt-6 -mt-6 mb-8 flex items-center justify-between gap-4 border-b border-gray-100/50">
                      <button
                        type="button"
                        onClick={closeCreateAd}
                        disabled={createAdSubmitting}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowLeft size={18} />
                        Back
                      </button>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={closeCreateAd}
                          disabled={createAdSubmitting}
                          className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                        {ad.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              saveCreateAd(createAdRequiresBilling ? "continue" : "save")
                            }
                            disabled={createAdSubmitting}
                            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {createAdPrimaryLabel}
                            {!createAdSubmitting && createAdRequiresBilling ? (
                              <ArrowRight size={16} />
                            ) : null}
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => saveCreateAd("draft")}
                              disabled={createAdSubmitting}
                              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {createAdSubmitting && createAdSubmitMode === "draft"
                                ? "Saving draft..."
                                : "Save as draft"}
                            </button>
                            <button
                              type="button"
                              onClick={() => saveCreateAd("continue")}
                              disabled={createAdSubmitting}
                              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-black hover:bg-gray-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {createAdPrimaryLabel}
                              {!createAdSubmitting ? <ArrowRight size={16} /> : null}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mb-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                          <img
                            src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                            alt="CBN Unfiltered Logo"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {ad.id ? "Edit ad" : "Create a new ad"}
                      </h1>
                      <p className="text-gray-600 text-sm">
                        Fill out the form below to create your advertising content.
                      </p>
                    </div>

                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveCreateAd(
                          ad.id && createAdRequiresBilling ? "continue" : "save",
                        );
                      }}
                      className="space-y-12"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <CreateAdAdvertiserField
                            advertisers={advertisers}
                            value={ad.advertiser_id || ""}
                            onChange={(nextValue) =>
                              setAd((current) => ({
                                ...current,
                                advertiser_id: nextValue,
                              }))
                            }
                            onCreateNew={() => openAdvertiserCreate("createAd")}
                            disabled={createAdSubmitting}
                          />

                          <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Placement
                            </label>
                            <select
                              value={ad.placement || ""}
                              onChange={(event) =>
                                setAd((current) => ({ ...current, placement: event.target.value }))
                              }
                              className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                              style={adsSelectStyle}
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Ad Product
                            </label>
                            <select
                              value={ad.product_id || ""}
                              onChange={(event) => {
                                const selectedProduct = products.find(
                                  (item) => item.id === event.target.value,
                                );
                                setAd((current) => ({
                                  ...current,
                                  product_id: event.target.value,
                                  placement: selectedProduct?.placement || current.placement || "",
                                  price: selectedProduct?.price || current.price || "",
                                }));
                              }}
                              className="w-full text-sm text-gray-900 bg-transparent focus:outline-none appearance-none cursor-pointer"
                              style={adsSelectStyle}
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

                          <div className="border border-gray-200 rounded-lg bg-white px-4 pt-4 pb-3 hover:border-gray-300 transition-all focus-within:border-gray-900 focus-within:ring-2 focus-within:ring-gray-900 focus-within:ring-offset-0">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Ad Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={ad.ad_name || ""}
                              onChange={(event) => handleCreateAdChange("ad_name", event.target.value)}
                              placeholder="Enter ad name"
                              className="w-full text-sm text-gray-900 placeholder:text-gray-400 bg-transparent focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <AdDetailsSection
                        formData={ad}
                        onChange={handleCreateAdChange}
                        onAddMedia={handleCreateAdAddMedia}
                        onRemoveMedia={handleCreateAdRemoveMedia}
                        showAlert={showCreateAdAlert}
                      />

                      <PostTypeSection
                        selectedType={selectedCreateAdPostType}
                        onChange={handleCreateAdChange}
                      />

                      <ScheduleSection
                        postType={selectedCreateAdPostType}
                        formData={ad}
                        onChange={handleCreateAdChange}
                        customDate={createAdCustomDate}
                        setCustomDate={setCreateAdCustomDate}
                        customTime={createAdCustomTime}
                        setCustomTime={setCreateAdCustomTime}
                        onAddCustomDate={handleCreateAdAddCustomDate}
                        onRemoveCustomDate={handleCreateAdRemoveCustomDate}
                        onUpdateCustomDateTime={handleCreateAdUpdateCustomDateTime}
                        onCheckAvailability={checkCreateAdAvailability}
                        checkingAvailability={createAdCheckingAvailability}
                        availabilityError={createAdAvailabilityError}
                        pastTimeError={null}
                        fullyBookedDates={createAdFullyBookedDates}
                        excludeAdId={ad.id || null}
                      />

                      <NotesSection notes={ad.notes || ""} onChange={handleCreateAdChange} />
                    </form>
                  </div>
                </div>

                <div className="hidden lg:flex w-[380px] xl:w-[420px] bg-[#F5F5F5] px-5 py-8 sm:px-6 sm:py-10 xl:py-12 flex-shrink-0 justify-center">
                  <div className="w-full max-w-[320px]">
                    <AdPreview formData={createAdPreviewData} />
                  </div>
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
                              phone_number: formatUSPhoneNumber(event.target.value),
                            })
                          }
                          inputMode="tel"
                          autoComplete="tel-national"
                          maxLength={US_PHONE_INPUT_MAX_LENGTH}
                          placeholder="(123) 456-7890"
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
                            Credits
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
                              colSpan={9}
                              className="px-6 py-12 text-center text-xs text-gray-500"
                            >
                              {advertiserSearch
                                ? "No advertisers found matching your search"
                                : "No advertisers yet. Click 'Add new Advertiser' to get started."}
                            </td>
                          </tr>
                        ) : (
                          paginatedAdvertisers.map((item) => {
                            const status = normalizeAdvertiserStatus(item.status);
                            const isActive = isAdvertiserActiveStatus(item.status);
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
                                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                    <span>
                                      {revealedPii[item.id] ? (item.email || "—") : maskEmail(item.email)}
                                    </span>
                                    {item.email && (
                                      <button
                                        type="button"
                                        onClick={(e) => toggleReveal(item.id, e)}
                                        className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                                        title={revealedPii[item.id] ? "Hide" : "Reveal"}
                                      >
                                        {revealedPii[item.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs text-gray-600">
                                    {revealedPii[item.id] ? (item.phone_number || item.phone || "—") : maskPhone(item.phone_number || item.phone)}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs font-medium text-gray-900">
                                    {formatCurrency(item.total_spend ?? item.ad_spend ?? 0)}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5">
                                  <div className="text-xs font-medium text-blue-700">
                                    {formatCurrency(item.credits || 0)}
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
                                    {isActive ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="px-6 py-3.5 relative">
                                  <button
                                    type="button"
                                    onClick={(event) => openAdvertiserMenu(item.id, event)}
                                    data-advertiser-menu-trigger="true"
                                    className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  >
                                    <MoreVertical size={18} className="text-gray-600" />
                                  </button>
                                  {openAdvertiserMenuId === item.id && typeof document !== "undefined"
                                    ? createPortal(
                                        <div
                                          ref={advertiserMenuRef}
                                          className="fixed w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-[200]"
                                          style={{
                                            top: `${advertiserMenuCoordinates.top}px`,
                                            left: `${advertiserMenuCoordinates.left}px`,
                                          }}
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
                                        </div>,
                                        document.body,
                                      )
                                    : null}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredAdvertisers.length > 0 ? (
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>Rows per page</span>
                        <select
                          value={advertisersPageSize}
                          onChange={(event) => {
                            setAdvertisersPageSize(Number(event.target.value) || 10);
                            setAdvertisersCurrentPage(1);
                          }}
                          className="h-9 min-w-[72px] rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          {ADS_PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        <span className="ml-2 text-xs text-gray-500">
                          {advertiserPageStartIndex}-{advertiserPageEndIndex} of{" "}
                          {filteredAdvertisers.length}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAdvertisersCurrentPage((current) => Math.max(1, current - 1))
                          }
                          disabled={advertisersCurrentPage <= 1}
                          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-gray-600 min-w-[90px] text-center">
                          Page {advertisersCurrentPage} of {advertiserTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAdvertisersCurrentPage((current) =>
                              Math.min(advertiserTotalPages, current + 1),
                            )
                          }
                          disabled={advertisersCurrentPage >= advertiserTotalPages}
                          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
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
                            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                              <span>
                                {revealedPii[advertiserViewModal.advertiser.id] ? (advertiserViewModal.advertiser.email || "—") : maskEmail(advertiserViewModal.advertiser.email)}
                              </span>
                              {advertiserViewModal.advertiser.email && (
                                <button
                                  type="button"
                                  onClick={(e) => toggleReveal(advertiserViewModal.advertiser.id, e)}
                                  className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                  {revealedPii[advertiserViewModal.advertiser.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Phone Number</p>
                            <p className="text-sm font-medium text-gray-900">
                              {revealedPii[advertiserViewModal.advertiser.id] ? (advertiserViewModal.advertiser.phone_number || advertiserViewModal.advertiser.phone || "—") : maskPhone(advertiserViewModal.advertiser.phone_number || advertiserViewModal.advertiser.phone)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total Spend</p>
                            <p className="text-sm font-medium text-gray-900">
                              {formatCurrency(advertiserViewModal.advertiser.total_spend || 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Credits Balance</p>
                            <p className="text-sm font-medium text-blue-700">
                              {formatCurrency(advertiserViewModal.advertiser.credits || 0)}
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
                          Credits Adjustment
                        </h3>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-2">
                                Amount
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={advertiserCreditsForm.amount}
                                onChange={(event) =>
                                  setAdvertiserCreditsForm((current) => ({
                                    ...current,
                                    amount: event.target.value,
                                  }))
                                }
                                placeholder="0.00"
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-2">
                                Reason
                              </label>
                              <input
                                type="text"
                                value={advertiserCreditsForm.reason}
                                onChange={(event) =>
                                  setAdvertiserCreditsForm((current) => ({
                                    ...current,
                                    reason: event.target.value,
                                  }))
                                }
                                placeholder="Manual top-up, correction, etc."
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                              />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                void adjustAdvertiserCredits("add");
                              }}
                              disabled={advertiserCreditsLoading}
                              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {advertiserCreditsLoading ? "Saving..." : "Add Credits"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void adjustAdvertiserCredits("deduct");
                              }}
                              disabled={advertiserCreditsLoading}
                              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {advertiserCreditsLoading ? "Saving..." : "Deduct Credits"}
                            </button>
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
                                      <p className="text-xs text-gray-500 mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
                                        {formatPostTypeLabel(adItem.post_type) || "—"} • {adItem.placement || "—"} •{" "}
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
                              phone_number: formatUSPhoneNumber(event.target.value),
                              phone: formatUSPhoneNumber(event.target.value),
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
                              data-product-menu-trigger="true"
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <MoreVertical size={18} className="text-gray-500" />
                            </button>

                            {openProductMenuId === item.id && typeof document !== "undefined"
                              ? createPortal(
                                  <div
                                    ref={productMenuRef}
                                    className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[200] py-1"
                                    style={{
                                      top: `${productMenuCoordinates.top}px`,
                                      left: `${productMenuCoordinates.left}px`,
                                    }}
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
                                  </div>,
                                  document.body,
                                )
                              : null}
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
                    {isAdvertiser
                      ? "View your invoices, balances, and payment status."
                      : "Manage invoices, track payments, and view billing history."}
                  </p>
                </div>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={openBillingCreditsComposer}
                    className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-all shadow-sm hover:shadow flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add Credits
                  </button>
                ) : null}
              </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
                      Total Available Credits
                    </div>
                    <div className="text-2xl font-bold text-sky-600">
                      {formatCurrency(invoiceSummary.totalCredits)}
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
                    <option value="Pending">Ready for Payment</option>
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
                    {isAdvertiser
                      ? "Invoices linked to your account will appear here."
                      : "Invoices are generated from approved ads."}
                  </p>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={openBillingCreditsComposer}
                      className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800"
                    >
                      Add Credits
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                {isAdmin && selectedInvoiceIds.size > 0 && (
                  <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
                    <span className="text-sm text-gray-700 font-medium">
                      {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size > 1 ? "s" : ""} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedInvoiceIds(new Set())}
                      className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      Clear
                    </button>
                    <div className="ml-auto">
                      <button
                        type="button"
                        onClick={handleBatchDeleteInvoices}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={13} />
                        Delete {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size > 1 ? "s" : ""}
                      </button>
                    </div>
                  </div>
                )}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          {isAdmin && (
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={filteredInvoices.length > 0 && filteredInvoices.every((i) => selectedInvoiceIds.has(String(i.id)))}
                                onChange={handleSelectAllInvoices}
                                className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                              />
                            </th>
                          )}
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
                            advertisers.find(
                              (adv) => String(adv.id || "") === String(item.advertiser_id || ""),
                            )
                              ?.advertiser_name ||
                            "-";
                          const status = normalizeInvoiceStatus(item.status);
                          const statusLabel = getInvoiceStatusLabel(status);
                          const itemCount =
                            Array.isArray(item.ad_ids) && item.ad_ids.length > 0
                              ? item.ad_ids.length
                              : Array.isArray(item.items)
                                ? item.items.length
                                : 0;
                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-gray-50 transition-colors cursor-pointer group"
                              onClick={() => openInvoicePreview(item)}
                            >
                              {isAdmin && (
                                <td
                                  className="px-4 py-4"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedInvoiceIds.has(String(item.id))}
                                    onChange={() => handleToggleSelectInvoice(item.id)}
                                    className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                                  />
                                </td>
                              )}
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
                                <div className="flex flex-col items-start gap-1.5">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getInvoiceStatusColor(
                                      status,
                                    )}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  {isInvoicePaidViaCredits(item) ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">
                                      Paid via Credits
                                    </span>
                                  ) : null}
                                </div>
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
                                {isAdvertiser ? (
                                  <button
                                    type="button"
                                    onClick={() => openInvoicePreview(item)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                  >
                                    <Eye size={14} className="text-gray-400" />
                                    View
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(event) => openInvoiceMenu(item.id, status, event)}
                                      disabled={isInvoiceActionPending(item.id)}
                                      data-invoice-menu-trigger="true"
                                      className="rounded-lg p-2 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <MoreVertical size={18} className="text-gray-500" />
                                    </button>
                                    {openInvoiceMenuId === item.id && typeof document !== "undefined"
                                      ? createPortal(
                                        <div
                                          ref={invoiceMenuRef}
                                          className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[200] py-1"
                                          style={{
                                            top: `${invoiceMenuCoordinates.top}px`,
                                            left: `${invoiceMenuCoordinates.left}px`,
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenInvoiceMenuId(null);
                                              openInvoicePreview(item);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                          >
                                            <Eye size={16} className="text-gray-400" />
                                            View Invoice
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenInvoiceMenuId(null);
                                              openInvoiceEditor(item);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                          >
                                            <Edit2 size={16} className="text-gray-400" />
                                            Edit Invoice
                                          </button>
                                          {status !== "Paid" ? (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void resendInvoicePaymentReminder(item);
                                                }}
                                                disabled={isInvoiceActionPending(item.id)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                <Mail size={16} className="text-gray-400" />
                                                Resend Payment Reminder
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenInvoiceMenuId(null);
                                                  markInvoiceAsPaid(item);
                                                }}
                                                disabled={isInvoiceActionPending(item.id)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                <CheckCircle size={16} className="text-gray-400" />
                                                Mark as Paid
                                              </button>
                                            </>
                                          ) : null}
                                          <div className="border-t border-gray-100 my-1" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenInvoiceMenuId(null);
                                              deleteInvoiceRecord(item.id);
                                            }}
                                            disabled={isInvoiceActionPending(item.id)}
                                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                          >
                                            <Trash2 size={16} className="text-red-500" />
                                            Delete
                                          </button>
                                        </div>,
                                        document.body,
                                      )
                                      : null}
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
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
                      <div className="p-8 overflow-y-auto max-h-[calc(90vh-64px)]">
                        <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-200">
                          <div>
                            <div className="flex items-center justify-start mb-3">
                              <img
                                src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                                alt="CBN Unfiltered Logo"
                                className="h-12 w-auto object-contain"
                              />
                            </div>
                            <div className="text-sm font-bold text-gray-900 mb-1">
                              {INVOICE_COMPANY_NAME}
                            </div>
                            <div className="text-xs text-gray-500 space-y-0.5">
                              <div>{INVOICE_COMPANY_ADDRESS}</div>
                              <div>{INVOICE_COMPANY_EMAIL}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500 mb-2">
                              #{invoicePreviewDetails?.invoiceNumber || invoicePreviewModal.id}
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <span
                                className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${getInvoiceStatusColor(
                                  invoicePreviewDetails?.status || invoicePreviewModal.status,
                                )}`}
                              >
                                {getInvoiceStatusLabel(
                                  invoicePreviewDetails?.status ||
                                    invoicePreviewModal.status ||
                                    "",
                                ).toUpperCase()}
                              </span>
                              {isInvoicePaidViaCredits(invoicePreviewModal) ? (
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700">
                                  Paid via Credits
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8 pb-6 border-b border-gray-200">
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                              Bill to
                            </div>
                            <div className="text-sm font-semibold text-gray-900 mb-1">
                              {invoicePreviewDetails?.advertiser?.advertiser_name ||
                                invoicePreviewModal.advertiser_name ||
                                "—"}
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              {invoicePreviewDetails?.attentionLine ? (
                                <div>Attn: {invoicePreviewDetails.attentionLine}</div>
                              ) : null}
                              {invoicePreviewDetails?.contactEmail ? (
                                <div>{invoicePreviewDetails.contactEmail}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                Issue Date
                              </div>
                              <div className="text-sm font-semibold text-gray-900">
                                {invoicePreviewDetails?.issueDate || "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                {isInvoicePaidViaCredits(invoicePreviewModal)
                                  ? "Amount Covered"
                                  : "Amount Due"}
                              </div>
                              <div className="text-lg font-bold text-gray-900">
                                {formatCurrency(invoicePreviewDetails?.total || 0)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mb-6">
                          <div className="flex justify-between mb-3">
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Description
                            </div>
                            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Amount
                            </div>
                          </div>
                          <div className="flex justify-between py-3 border-b border-gray-100 gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">
                                {invoicePreviewDetails?.primaryDescription || "Advertising services"}
                              </div>
                              {invoicePreviewDetails &&
                                invoicePreviewDetails.linkedAds.length > 1 ? (
                                <div className="text-xs text-gray-500 mt-0.5 truncate">
                                  {invoicePreviewDetails.linkedAds
                                    .map((item) => item.ad_name)
                                    .join(" • ")}
                                </div>
                              ) : null}
                            </div>
                            <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                              {formatCurrency(invoicePreviewDetails?.total || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mb-8 pb-6 border-b border-gray-200">
                          <div className="flex justify-between text-sm">
                            <div className="text-gray-600">Subtotal</div>
                            <div className="font-medium text-gray-900">
                              {formatCurrency(invoicePreviewDetails?.total || 0)}
                            </div>
                          </div>
                          <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                            <div className="text-gray-900">Total</div>
                            <div className="text-gray-900">
                              {formatCurrency(invoicePreviewDetails?.total || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="text-center space-y-2">
                          <div className="text-sm font-medium text-gray-900">
                            Thank you for your business
                          </div>
                          <div className="text-xs text-gray-500 leading-relaxed">
                            {isInvoicePaidViaCredits(invoicePreviewModal)
                              ? "This invoice was fully covered by prepaid credits. No transfer is required."
                              : (
                                  <>
                                    Please include invoice #
                                    {invoicePreviewDetails?.invoiceNumber || invoicePreviewModal.id} in
                                    transfer description.
                                  </>
                                )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={printInvoicePreview}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                          >
                            <Printer size={16} />
                            Print
                          </button>
                          <button
                            type="button"
                            onClick={downloadInvoicePreview}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                          >
                            <Download size={16} />
                            Download
                          </button>
                          <div className="flex-1" />
                          <button
                            type="button"
                            onClick={() => setInvoicePreviewModal(null)}
                            className="px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {activeSection === "Billing" && view === "newInvoice" && isAdmin && (
            <div className="max-w-[1400px] mx-auto">
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setBillingComposerMode("invoice");
                  setInvoice(createBlankInvoice());
                }}
                disabled={invoiceSaving}
                className="mb-6 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft size={16} />
                Back to Billing
              </button>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    {invoice.id
                      ? "Edit Invoice"
                      : isCreditComposer
                        ? "Add Credits"
                        : "Create Invoice"}
                  </h2>
                  <p className="text-sm text-gray-500 mb-8">
                    {isCreditComposer
                      ? "Create a CRE-prefixed billing record and add prepaid credits to an advertiser."
                      : "Select an advertiser and include linked ads for billing"}
                  </p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        value={invoice.invoice_number}
                        readOnly
                        placeholder={
                          isCreditComposer
                            ? "Auto-generated as CRE on save"
                            : "Auto-generated on save"
                        }
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none transition-all"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        {isCreditComposer
                          ? "Credit records are assigned a CRE number automatically and cannot be edited."
                          : "Invoice numbers are assigned automatically and cannot be edited."}
                      </p>
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

                      {selectedInvoiceAdvertiser ? (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                                {isCreditComposer ? "Current Credit Balance" : "Prepaid Credits"}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-blue-900">
                                {formatCurrency(selectedAdvertiserCredits)}
                              </div>
                            </div>
                            {!isCreditComposer && canApplyCreditsToInvoice ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void applyCreditsToInvoice();
                                }}
                                disabled={invoiceCreditsApplying}
                                className="inline-flex items-center justify-center self-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {invoiceCreditsApplying ? "Applying..." : "Apply Credit"}
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-blue-800">
                            {isCreditComposer
                              ? `Balance after top-up: ${formatCurrency(
                                  selectedAdvertiserCredits + invoicePreviewAmount,
                                )}`
                              : invoicePreviewAmount <= 0
                                ? "Enter an invoice total to check credit coverage."
                                : creditsCoverInvoiceTotal
                                  ? "This balance can fully cover the current invoice total."
                                  : "Available credits are not enough to cover the current invoice total."}
                          </div>
                        </div>
                      ) : null}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Amount
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={invoice.amount}
                          onChange={(event) => {
                            const nextAmountText = event.target.value;
                            if (isCreditComposer) {
                              setInvoice({
                                ...invoice,
                                amount: nextAmountText,
                                total: nextAmountText,
                                status: "Paid",
                              });
                              return;
                            }
                            const parsedAmount = Number.parseFloat(
                              String(nextAmountText || "").trim(),
                            );
                            const hasNumericAmount = Number.isFinite(parsedAmount);

                            if (hasNumericAmount) {
                              const invoiceItems =
                                Array.isArray(invoice.items) && invoice.items.length > 0
                                  ? invoice.items
                                  : invoicePreviewLinkedAds.flatMap((linkedAd, adIndex) => {
                                      const linkedUnitPrice = Number(linkedAd?.price || 0) || 0;
                                      return buildInvoiceItemsFromAd({
                                        adRecord: linkedAd,
                                        unitPrice: linkedUnitPrice,
                                      }).map((item, itemIndex) => ({
                                        ...item,
                                        id:
                                          item.id ||
                                          `${String(linkedAd?.id || adIndex)}-${itemIndex}`,
                                      }));
                                    });

                              if (invoiceItems.length > 0) {
                                setInvoice({
                                  ...invoice,
                                  amount: nextAmountText,
                                  total: nextAmountText,
                                  items: rebalanceInvoiceItemsToAmount(invoiceItems, parsedAmount),
                                });
                                return;
                              }
                            }

                            setInvoice({
                              ...invoice,
                              amount: nextAmountText,
                              total: nextAmountText,
                            });
                          }}
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
                          value={invoice.issue_date || getTodayInAppTimeZone()}
                          readOnly
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {isCreditComposer ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Reason
                        </label>
                        <input
                          type="text"
                          value={invoice.notes}
                          onChange={(event) =>
                            setInvoice({
                              ...invoice,
                              notes: event.target.value,
                              status: "Paid",
                            })
                          }
                          placeholder="Manual credit top-up"
                          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                        />
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-2">
                        Status
                      </label>
                      <select
                        value={isCreditComposer ? "Paid" : normalizeInvoiceStatus(invoice.status)}
                        onChange={(event) =>
                          setInvoice({ ...invoice, status: event.target.value })
                        }
                        disabled={isCreditComposer || isInvoicePaidViaCredits(invoice)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all"
                      >
                        <option value="Paid">Paid</option>
                        <option value="Pending">Ready for Payment</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                      {isCreditComposer ? (
                        <p className="mt-2 text-xs text-blue-700">
                          Credit top-up records stay marked as Paid.
                        </p>
                      ) : isInvoicePaidViaCredits(invoice) ? (
                        <p className="mt-2 text-xs text-blue-700">
                          Credit-paid invoices stay marked as Paid.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={saveInvoiceForm}
                        disabled={invoiceSaving}
                        className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {invoiceSaving
                          ? "Submitting..."
                          : isCreditComposer
                            ? "Add Credits"
                            : "Save Invoice"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setInvoice({
                            ...createBlankInvoice(),
                            status: isCreditComposer ? "Paid" : "Pending",
                          })
                        }
                        disabled={invoiceSaving}
                        className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-10 h-fit sticky top-8">
                  <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {isCreditComposer ? "Credit Preview" : "Invoice Preview"}
                  </div>

                  <div className="flex items-start justify-between mb-10 pb-8 border-b border-gray-200">
                    <div>
                      <div className="flex items-center justify-start mb-4">
                        <img
                          src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/"
                          alt="CBN Unfiltered Logo"
                          className="h-20 w-auto"
                        />
                      </div>
                      <div className="text-base font-bold text-gray-900 mb-2">{INVOICE_COMPANY_NAME}</div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>{INVOICE_COMPANY_ADDRESS}</div>
                        <div>{INVOICE_COMPANY_EMAIL}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-2">
                        {invoice.invoice_number || (isCreditComposer ? "New Credit Entry" : "New Invoice")}
                      </div>
                      <div
                        className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${getInvoiceStatusColor(
                          invoicePreviewStatus,
                        )}`}
                      >
                        {getInvoiceStatusLabel(invoicePreviewStatus).toUpperCase()}
                      </div>
                      {isInvoicePaidViaCredits(invoice) ? (
                        <div className="mt-2 inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700">
                          Paid via Credits
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-10 pb-8 border-b border-gray-200">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Bill to
                      </div>
                      <div className="text-sm font-semibold text-gray-900 mb-2">
                        {selectedInvoiceAdvertiser?.advertiser_name || "—"}
                      </div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div>
                          Attn:{" "}
                          {selectedInvoiceAdvertiser?.contact_name ||
                            selectedInvoiceAdvertiser?.email ||
                            "—"}
                        </div>
                        <div>{selectedInvoiceAdvertiser?.email || "—"}</div>
                      </div>
                    </div>
                    <div className="text-right space-y-4">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          Issue Date
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          {formatInvoiceListDate(invoice.issue_date) || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                          {isCreditComposer
                            ? "Credit Amount"
                            : isInvoicePaidViaCredits(invoice)
                              ? "Amount Covered"
                              : "Amount Due"}
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatCurrency(invoicePreviewAmount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-8">
                    <div className="flex justify-between mb-3">
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Description
                      </div>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                        Amount
                      </div>
                    </div>
                    {invoicePreviewItems.map((previewItem) => (
                      <div
                        key={previewItem.key}
                        className="flex justify-between py-3 border-b border-gray-100 gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {previewItem.title}
                          </div>
                          {previewItem.detail ? (
                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                              {previewItem.detail}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(previewItem.amount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 mb-10 pb-8 border-b border-gray-200">
                    <div className="flex justify-between text-sm">
                      <div className="text-gray-600">Subtotal</div>
                      <div className="font-medium text-gray-900">
                        {formatCurrency(invoicePreviewSubtotal)}
                      </div>
                    </div>
                    {invoicePreviewDiscount > 0 ? (
                      <div className="flex justify-between text-sm">
                        <div className="text-gray-600">Discount</div>
                        <div className="font-medium text-gray-900">
                          -{formatCurrency(invoicePreviewDiscount)}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-sm">
                      <div className="text-gray-600">Tax</div>
                      <div className="font-medium text-gray-900">
                        {formatCurrency(invoicePreviewTax)}
                      </div>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-3 border-t border-gray-200">
                      <div className="text-gray-900">Total</div>
                      <div className="text-gray-900">
                        {formatCurrency(invoicePreviewAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="text-center space-y-2">
                    <div className="text-sm font-medium text-gray-900">
                      Thank you for your business
                    </div>
                    <div className="text-xs text-gray-500 leading-relaxed">
                      {isCreditComposer
                        ? "These credits will be added to the advertiser balance when you save."
                        : "Payment is due upon receipt. Please include invoice number in transfer description."}
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

          {activeSection === "Settings" && canViewSettings && (
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
                        onChange={(event) =>
                          setSettingsProfileWhatsapp(formatUSPhoneNumber(event.target.value))
                        }
                        inputMode="tel"
                        autoComplete="tel-national"
                        maxLength={US_PHONE_INPUT_MAX_LENGTH}
                        placeholder="(123) 456-7890"
                        className="w-full max-w-md px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Use standard US format for reminders.
                      </p>
                    </div>

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
                    <div className="flex items-center gap-3">
                      {/* View Mode Toggle */}
                      <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                          onClick={() => setSettingsTeamViewMode("grid")}
                          className={`p-1.5 rounded-md transition-colors ${settingsTeamViewMode === "grid" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                          title="Grid View"
                        >
                          <LayoutGrid size={16} />
                        </button>
                        <button
                          onClick={() => setSettingsTeamViewMode("list")}
                          className={`p-1.5 rounded-md transition-colors ${settingsTeamViewMode === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                          title="List View"
                        >
                          <List size={16} />
                        </button>
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
                  </div>
                  {settingsTeamViewMode === "list" ? (
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
                  ) : (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-gray-50/50">
                      {teamMembers.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-sm text-gray-500 border border-gray-200 rounded-xl bg-white border-dashed">
                          No team members yet. Add your first member to get started.
                        </div>
                      ) : (
                        teamMembers.map((member) => (
                          <div 
                            key={member.id}
                            className="relative flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-[#eef2ff] border border-blue-100 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                                  {member.image ? (
                                    <img
                                      src={member.image}
                                      alt={member.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-blue-700 font-bold text-lg uppercase">
                                      {member.name ? member.name.charAt(0) : <User size={20} className="text-blue-600/60" />}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-sm font-bold text-gray-900 truncate" title={member.name || "No name"}>
                                    {member.name || "No name"}
                                  </h4>
                                  <p className="text-xs text-gray-500 truncate mt-0.5" title={member.email}>
                                    {member.email}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSettingsRemoveMember(member)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors shrink-0"
                                title="Remove Member"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            
                            <div className="mt-auto border-t border-gray-100 pt-3">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border shadow-sm ${
                                  member.role === "admin"
                                    ? "bg-amber-50 text-yellow-700 border-amber-200/60"
                                    : member.role === "manager"
                                    ? "bg-blue-50 text-blue-700 border-blue-200/60"
                                    : member.role === "advertiser"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                                    : "bg-gray-50 text-gray-700 border-gray-200/60"
                                }`}
                              >
                                {member.role === "admin" && <Crown size={12} className="opacity-80 drop-shadow-sm" />}
                                {member.role || "member"}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
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
                          Role
                        </label>
                        <select
                          value={settingsTeamRole}
                          onChange={(event) => setSettingsTeamRole(event.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900"
                        >
                          <option value="staff">Staff</option>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
                        We will create this team account and email them a secure link to verify
                        and set their password.
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsTeamModalOpen(false);
                            setSettingsTeamName("");
                            setSettingsTeamEmail("");
                            setSettingsTeamRole("staff");
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
                      Reminder emails are sent to internal team members
                      (owner/admin/manager/staff/assistant) and the advertiser based on the
                      reminder time set on each ad.
                    </p>
                  </div>

                  <div className="p-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">
                        Internal reminder timing (legacy)
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        Ad-level reminder settings now drive reminder emails for
                        internal users and advertisers. This value is kept for
                        backward compatibility.
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
                            void handleSettingsToggleTelegramEnabled(event.target.checked)
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
                                    Verify that the bot token is valid and connected.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleSettingsSetupTelegramWebhook}
                                  disabled={settingsTelegramWebhookLoading}
                                  className="px-3 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg border border-gray-300 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {settingsTelegramWebhookLoading
                                    ? "Verifying..."
                                    : "Verify Bot"}
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
                            placeholder="(123) 456-7890"
                            value={settingsNotification.phone_number}
                            onChange={(event) =>
                              setSettingsNotification((current) => ({
                                ...current,
                                phone_number: formatUSPhoneNumber(event.target.value),
                              }))
                            }
                            inputMode="tel"
                            autoComplete="tel-national"
                            maxLength={US_PHONE_INPUT_MAX_LENGTH}
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
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleSettingsSendTestWhatsApp}
                          disabled={settingsNotificationWhatsAppTesting}
                          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {settingsNotificationWhatsAppTesting
                            ? "Sending..."
                            : "Send Test WhatsApp"}
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

        <Modal
          isOpen={Boolean(submissionEditModal)}
          onClose={() => {
            if (!submissionEditLoading) {
              resetSubmissionEditState();
            }
          }}
          size="xl"
        >
          {submissionEditModal ? (
            <div className="flex max-h-[90vh] flex-col">
              <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {isSubmissionReviewMode ? "Review submission" : "Edit pending submission"}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {isSubmissionReviewMode
                        ? submissionReviewDescription
                        : "Update this submission before the team reviews it."}
                    </p>
                    <div className="mt-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getSubmissionStatusBadgeClass(
                          submissionEditModal.status,
                        )}`}
                      >
                        {formatSubmissionStatus(submissionEditModal.status)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!submissionEditLoading) {
                        resetSubmissionEditState();
                      }
                    }}
                    disabled={submissionEditLoading}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Close edit submission modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto px-6 py-6">
                <div className="space-y-8">
                  <AdvertiserInfoSection
                    formData={submissionEditForm}
                    onChange={handleSubmissionEditChange}
                  />

                  <AdDetailsSection
                    formData={submissionEditForm}
                    onChange={handleSubmissionEditChange}
                    onAddMedia={addSubmissionEditMedia}
                    onRemoveMedia={removeSubmissionEditMedia}
                  />

                  <PostTypeSection
                    selectedType={submissionEditForm.post_type}
                    onChange={handleSubmissionEditChange}
                  />

                  <ScheduleSection
                    postType={submissionEditForm.post_type}
                    formData={submissionEditForm}
                    onChange={handleSubmissionEditChange}
                    customDate={submissionEditCustomDate}
                    setCustomDate={setSubmissionEditCustomDate}
                    customTime={submissionEditCustomTime}
                    setCustomTime={setSubmissionEditCustomTime}
                    onAddCustomDate={addSubmissionEditCustomDate}
                    onRemoveCustomDate={removeSubmissionEditCustomDate}
                    onUpdateCustomDateTime={updateSubmissionEditCustomDateTime}
                    onCheckAvailability={checkSubmissionEditAvailability}
                    checkingAvailability={submissionEditCheckingAvailability}
                    availabilityError={submissionEditAvailabilityError}
                    pastTimeError={submissionEditPastTimeError}
                    fullyBookedDates={submissionEditFullyBookedDates}
                    excludeAdId={submissionEditModal.id}
                  />

                  <NotesSection
                    notes={submissionEditForm.notes}
                    onChange={handleSubmissionEditChange}
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                {isSubmissionReviewMode && submissionReviewAction === "reject" ? (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">Rejection feedback</p>
                    <p className="mt-1 text-xs text-amber-800">
                      Select one or more reasons, and optionally add extra reviewer notes.
                    </p>
                    <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-amber-200 bg-white p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {submissionRejectReasonLibrary.map((reason) => {
                          const checked = submissionRejectSelectedReasons.some(
                            (item) => item.toLowerCase() === reason.toLowerCase(),
                          );
                          return (
                            <label
                              key={reason}
                              className="flex items-center gap-2 text-xs text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) =>
                                  toggleSubmissionRejectReason(reason, event.target.checked)
                                }
                                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                                disabled={submissionEditLoading}
                              />
                              <span>{reason}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={submissionRejectNewReason}
                        onChange={(event) => setSubmissionRejectNewReason(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSubmissionRejectReasonOption();
                          }
                        }}
                        placeholder="Add another reason (e.g. Missing CTA)"
                        disabled={submissionEditLoading}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={addSubmissionRejectReasonOption}
                        disabled={submissionEditLoading || !submissionRejectNewReason.trim()}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add reason
                      </button>
                    </div>
                    <textarea
                      value={submissionRejectNote}
                      onChange={(event) => setSubmissionRejectNote(event.target.value)}
                      disabled={submissionEditLoading}
                      rows={3}
                      placeholder="Additional notes for the advertiser (optional)."
                      className="mt-3 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={resetSubmissionEditState}
                    disabled={submissionEditLoading}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmissionReviewMode ? "Close" : "Cancel"}
                  </button>
                  {isSubmissionReviewMode ? (
                    <div className="flex items-center gap-3">
                      <select
                        value={submissionReviewAction}
                        onChange={(event) => setSubmissionReviewAction(event.target.value)}
                        disabled={submissionEditLoading}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submissionReviewActionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void submitSubmissionReviewAction()}
                        disabled={
                          submissionEditLoading ||
                          !submissionReviewAction ||
                          submissionReviewActionOptions.length === 0 ||
                          (submissionReviewAction === "reject" &&
                            !hasSubmissionRejectFeedback)
                        }
                        className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submissionEditLoading ? "Submitting..." : "Submit Action"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={saveSubmissionEdit}
                      disabled={submissionEditLoading || submissionEditCheckingAvailability}
                      className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submissionEditLoading ? "Saving..." : "Save changes"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </Modal>
      </div>
    </div>
  );
}
