"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  LogOut,
  ChevronDown,
  Settings,
  ArrowLeft,
  Plus,
  Search,
  Download,
  Clock3,
  AlertCircle,
  TrendingUp,
  Users,
  DollarSign,
  FileText,
  Calendar,
  RefreshCw,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { getSignedInUser } from "@/lib/localAuth";
import {
  approvePendingAd,
  deleteAd,
  deleteAdvertiser,
  deleteInvoice,
  deletePendingAd,
  deleteProduct,
  ensureDb,
  exportAdsCsv,
  exportDbJson,
  getReconciliationReport,
  readDb,
  rejectPendingAd,
  resetDb,
  subscribeDb,
  updateAdPayment,
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
  "Advertisers",
  "Ads",
  "Products",
  "Billing",
  "Reconciliation",
  "Settings",
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
  email: "",
  phone: "",
  business_name: "",
};

const blankProduct = {
  id: "",
  product_name: "",
  price: "",
  description: "",
};

const blankInvoice = {
  id: "",
  invoice_number: "",
  advertiser_id: "",
  amount: "",
  due_date: "",
  status: "Unpaid",
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
  const [adsSearch, setAdsSearch] = useState("");
  const [adsStatusFilter, setAdsStatusFilter] = useState("All Ads");
  const [adsPaymentFilter, setAdsPaymentFilter] = useState("All Payment Status");
  const [calendarSearch, setCalendarSearch] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [advertiserSearch, setAdvertiserSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const [ad, setAd] = useState(blankAd);
  const [advertiser, setAdvertiser] = useState(blankAdvertiser);
  const [product, setProduct] = useState(blankProduct);
  const [invoice, setInvoice] = useState(blankInvoice);

  useEffect(() => {
    ensureDb();
    const sync = () => {
      setDb(readDb());
      setUser(getSignedInUser());
      setReady(true);
    };
    sync();
    return subscribeDb(sync);
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

  const advertisers = db.advertisers || [];
  const products = db.products || [];
  const ads = db.ads || [];
  const pending = db.pending_ads || [];
  const invoices = db.invoices || [];

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

  const filteredAds = useMemo(() => {
    return ads.filter((item) => {
      const matchesSearch =
        !adsSearch ||
        String(item.ad_name || "")
          .toLowerCase()
          .includes(adsSearch.toLowerCase()) ||
        String(item.advertiser || "")
          .toLowerCase()
          .includes(adsSearch.toLowerCase()) ||
        String(item.placement || "")
          .toLowerCase()
          .includes(adsSearch.toLowerCase());

      const matchesStatus =
        adsStatusFilter === "All Ads" || item.status === adsStatusFilter;
      const matchesPayment =
        adsPaymentFilter === "All Payment Status" ||
        item.payment === adsPaymentFilter;

      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [ads, adsPaymentFilter, adsSearch, adsStatusFilter]);

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

  const filteredUpcomingAds = useMemo(() => {
    return upcomingAds.filter((item) => {
      if (!calendarSearch) {
        return true;
      }
      const query = calendarSearch.toLowerCase();
      return (
        String(item.ad_name || "").toLowerCase().includes(query) ||
        String(item.advertiser || "").toLowerCase().includes(query) ||
        String(item.status || "").toLowerCase().includes(query)
      );
    });
  }, [calendarSearch, upcomingAds]);

  const filteredPendingSubmissions = useMemo(() => {
    return pending.filter((item) => {
      if (!submissionSearch) {
        return true;
      }
      const query = submissionSearch.toLowerCase();
      return (
        String(item.ad_name || "").toLowerCase().includes(query) ||
        String(item.advertiser_name || "").toLowerCase().includes(query) ||
        String(item.status || "").toLowerCase().includes(query)
      );
    });
  }, [pending, submissionSearch]);

  const filteredAdvertisers = useMemo(() => {
    return advertisers.filter((item) => {
      if (!advertiserSearch) {
        return true;
      }
      const query = advertiserSearch.toLowerCase();
      return (
        String(item.advertiser_name || "").toLowerCase().includes(query) ||
        String(item.email || "").toLowerCase().includes(query)
      );
    });
  }, [advertiserSearch, advertisers]);

  const filteredProducts = useMemo(() => {
    return products.filter((item) => {
      if (!productSearch) {
        return true;
      }
      const query = productSearch.toLowerCase();
      return (
        String(item.product_name || "").toLowerCase().includes(query) ||
        String(item.description || "").toLowerCase().includes(query)
      );
    });
  }, [productSearch, products]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((item) => {
      if (!invoiceSearch) {
        return true;
      }

      const advertiserName =
        advertisers.find((adv) => adv.id === item.advertiser_id)?.advertiser_name || "";
      const query = invoiceSearch.toLowerCase();
      return (
        String(item.invoice_number || "").toLowerCase().includes(query) ||
        String(item.status || "").toLowerCase().includes(query) ||
        advertiserName.toLowerCase().includes(query)
      );
    });
  }, [advertisers, invoiceSearch, invoices]);

  const reconciliation = useMemo(() => getReconciliationReport(), [db]);

  const run = (fn, successText) => {
    try {
      fn();
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

  const handleNavigate = (section) => {
    if (!sections.includes(section)) {
      return;
    }
    setActiveSection(section);
    setView("list");
    setAd(blankAd);
    setInvoice(blankInvoice);
    setShowProfileDropdown(false);
  };

  const syncDashboardData = () => {
    if (syncing) {
      return;
    }
    setSyncing(true);
    setDb(readDb());
    setMessage("Dashboard synced.");
    window.setTimeout(() => setMessage(""), 1800);
    window.setTimeout(() => setSyncing(false), 500);
  };

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

        <main className="flex-1 overflow-auto bg-gray-50 p-8">
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
                <button
                  type="button"
                  onClick={syncDashboardData}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync Data"}
                </button>
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
                                className={`inline-block mt-1 rounded px-2 py-0.5 text-xs font-medium ${
                                  item.status === "Published"
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
                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                  item.status === "Published"
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
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
                  <p className="text-sm text-gray-500">
                    View upcoming ad schedule and publication timeline
                  </p>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                    placeholder="Search upcoming schedule..."
                    value={calendarSearch}
                    onChange={(event) => setCalendarSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Ad
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Advertiser
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUpcomingAds.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">{item.ad_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.placement || "-"}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {item.advertiser || "-"}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {formatDate(item.post_date)}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {formatTime(item.post_time)}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                              {item.status || "Draft"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredUpcomingAds.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-6 py-12 text-center text-sm text-gray-500"
                          >
                            No upcoming ads.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="px-5 py-4 border-b border-gray-200">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Next Up
                    </h2>
                  </div>
                  <div className="p-5">
                    {filteredUpcomingAds.slice(0, 8).length > 0 ? (
                      <div className="space-y-3">
                        {filteredUpcomingAds.slice(0, 8).map((item) => (
                          <div
                            key={`next-${item.id}`}
                            className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                          >
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.ad_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatDate(item.post_date)} at {formatTime(item.post_time)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No upcoming posts.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Submissions" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                    Submissions
                  </h1>
                  <p className="text-sm text-gray-500">
                    Review and approve advertising requests from clients
                  </p>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                    placeholder="Search submissions..."
                    value={submissionSearch}
                    onChange={(event) => setSubmissionSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Ad Request
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Advertiser
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingSubmissions.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-gray-900">
                            {item.ad_name || "-"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate(item.post_date)} {formatTime(item.post_time)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {item.advertiser_name || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700">
                            {item.status || "pending"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2 text-xs">
                            {item.status === "pending" ? (
                              <>
                                <button
                                  className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                  type="button"
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
                                  className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                  type="button"
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
                            <button
                              className="rounded-md border border-red-200 px-2.5 py-1 text-red-700 hover:bg-red-50"
                              type="button"
                              onClick={() =>
                                run(
                                  () => deletePendingAd(item.id),
                                  "Submission deleted.",
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredPendingSubmissions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-6 py-12 text-center text-sm text-gray-500"
                        >
                          No pending submissions.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === "Ads" && view === "list" && (
            <div>
              <div className="max-w-[1600px] mx-auto">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                      Ads
                    </h1>
                    <p className="text-sm text-gray-500">
                      Manage and publish scheduled ads
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      type="button"
                      onClick={() =>
                        download(
                          `cbnads-ads-${Date.now()}.csv`,
                          exportAdsCsv(),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      <Download size={16} />
                      Export
                    </button>

                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                      type="button"
                      onClick={() => {
                        setAd(blankAd);
                        setView("createAd");
                      }}
                    >
                      <Plus size={16} />
                      Create New
                    </button>
                  </div>
                </div>

                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                      value={adsStatusFilter}
                      onChange={(event) => setAdsStatusFilter(event.target.value)}
                    >
                      {["All Ads", "Draft", "Scheduled", "Published"].map(
                        (status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ),
                      )}
                    </select>

                    <select
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                      value={adsPaymentFilter}
                      onChange={(event) => setAdsPaymentFilter(event.target.value)}
                    >
                      {["All Payment Status", "Paid", "Unpaid"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative w-full max-w-sm">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={16}
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                      placeholder="Search by ad, advertiser, placement..."
                      value={adsSearch}
                      onChange={(event) => setAdsSearch(event.target.value)}
                    />
                  </div>
                </div>

                <div className="mb-4 text-sm text-gray-600">
                  Showing {filteredAds.length} of {ads.length} ads
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Ad Name
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Advertiser
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Schedule
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Payment
                        </th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredAds.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-gray-100 align-top last:border-0"
                        >
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {item.ad_name || "-"}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {item.placement || "-"}
                            </p>
                          </td>

                          <td className="px-6 py-4 text-sm text-gray-700">
                            {item.advertiser || "-"}
                          </td>

                          <td className="px-6 py-4 text-sm text-gray-700">
                            {formatDate(item.post_date)}{" "}
                            {item.post_time ? `at ${item.post_time}` : ""}
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                item.status === "Published"
                                  ? "bg-green-50 text-green-700"
                                  : item.status === "Scheduled"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {item.status || "Draft"}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                item.payment === "Paid"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {item.payment || "Unpaid"}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                type="button"
                                onClick={() => {
                                  setAd({ ...blankAd, ...item });
                                  setView("createAd");
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                type="button"
                                onClick={() =>
                                  run(
                                    () => updateAdStatus(item.id, "Published"),
                                    "Ad published.",
                                  )
                                }
                              >
                                Publish
                              </button>
                              <button
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                type="button"
                                onClick={() =>
                                  run(
                                    () =>
                                      updateAdPayment(
                                        item.id,
                                        item.payment === "Paid"
                                          ? "Unpaid"
                                          : "Paid",
                                      ),
                                    "Payment updated.",
                                  )
                                }
                              >
                                Toggle Pay
                              </button>
                              <button
                                className="rounded-md border border-red-200 px-2.5 py-1 text-red-700 hover:bg-red-50"
                                type="button"
                                onClick={() =>
                                  run(() => deleteAd(item.id), "Ad deleted.")
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {filteredAds.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-6 py-12 text-center text-sm text-gray-500"
                          >
                            No ads match your current filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activeSection === "Ads" && view === "createAd" && (
            <div className="max-w-[900px] mx-auto">
              <button
                className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                type="button"
                onClick={() => {
                  setView("list");
                  setAd(blankAd);
                }}
              >
                <ArrowLeft size={16} />
                Back to Ads
              </button>

              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  {ad.id ? "Edit Advertisement" : "Create New Advertisement"}
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Fill in the details below to schedule and manage this ad
                </p>

                <div className="space-y-4 text-sm">
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    placeholder="Ad name"
                    value={ad.ad_name}
                    onChange={(event) =>
                      setAd({ ...ad, ad_name: event.target.value })
                    }
                  />
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    value={ad.advertiser_id}
                    onChange={(event) =>
                      setAd({ ...ad, advertiser_id: event.target.value })
                    }
                  >
                    <option value="">Select advertiser</option>
                    {advertisers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.advertiser_name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    value={ad.product_id}
                    onChange={(event) =>
                      setAd({ ...ad, product_id: event.target.value })
                    }
                  >
                    <option value="">Select product</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.product_name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      type="date"
                      value={ad.post_date}
                      onChange={(event) =>
                        setAd({ ...ad, post_date: event.target.value })
                      }
                    />
                    <input
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      type="time"
                      value={ad.post_time}
                      onChange={(event) =>
                        setAd({ ...ad, post_time: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      value={ad.status}
                      onChange={(event) =>
                        setAd({ ...ad, status: event.target.value })
                      }
                    >
                      {["Draft", "Scheduled", "Published", "Archived"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      value={ad.payment}
                      onChange={(event) =>
                        setAd({ ...ad, payment: event.target.value })
                      }
                    >
                      {["Unpaid", "Paid"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    type="number"
                    placeholder="Price"
                    value={ad.price}
                    onChange={(event) =>
                      setAd({ ...ad, price: event.target.value })
                    }
                  />
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    placeholder="Notes"
                    value={ad.notes}
                    onChange={(event) =>
                      setAd({ ...ad, notes: event.target.value })
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
                      type="button"
                      onClick={() =>
                        run(() => {
                          if (!ad.ad_name) {
                            throw new Error("Ad name required");
                          }
                          if (!ad.advertiser_id) {
                            throw new Error("Advertiser required");
                          }
                          upsertAd(ad);
                          setAd(blankAd);
                          setView("list");
                        }, "Ad saved.")
                      }
                    >
                      Save
                    </button>
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      type="button"
                      onClick={() => setAd(blankAd)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Advertisers" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                    Advertisers
                  </h1>
                  <p className="text-sm text-gray-500">
                    Manage all advertiser accounts and spending
                  </p>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                    placeholder="Search advertisers..."
                    value={advertiserSearch}
                    onChange={(event) => setAdvertiserSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-4">
                    {advertiser.id ? "Edit advertiser" : "Create advertiser"}
                  </h2>
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      placeholder="Advertiser name"
                      value={advertiser.advertiser_name}
                      onChange={(event) =>
                        setAdvertiser({
                          ...advertiser,
                          advertiser_name: event.target.value,
                        })
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      placeholder="Email"
                      value={advertiser.email}
                      onChange={(event) =>
                        setAdvertiser({ ...advertiser, email: event.target.value })
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                        type="button"
                        onClick={() =>
                          run(() => {
                            if (!advertiser.advertiser_name) {
                              throw new Error("Advertiser name required");
                            }
                            upsertAdvertiser(advertiser);
                            setAdvertiser(blankAdvertiser);
                          }, "Advertiser saved.")
                        }
                      >
                        Save
                      </button>
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        type="button"
                        onClick={() => setAdvertiser(blankAdvertiser)}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Advertiser
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Spend
                        </th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdvertisers.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {item.advertiser_name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {item.email || "-"}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {formatCurrency(item.ad_spend || item.total_spend || 0)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                type="button"
                                onClick={() =>
                                  setAdvertiser({
                                    id: item.id,
                                    advertiser_name: item.advertiser_name || "",
                                    email: item.email || "",
                                    phone: item.phone || "",
                                    business_name: item.business_name || "",
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-md border border-red-200 px-2.5 py-1 text-red-700 hover:bg-red-50"
                                type="button"
                                onClick={() =>
                                  run(
                                    () => deleteAdvertiser(item.id),
                                    "Advertiser deleted.",
                                  )
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredAdvertisers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 py-12 text-center text-sm text-gray-500"
                          >
                            No advertisers match your search.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Products" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                    Products
                  </h1>
                  <p className="text-sm text-gray-500">
                    Manage your ad packages and product pricing
                  </p>
                </div>
                <div className="relative w-full max-w-sm">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={16}
                  />
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
                <div className="rounded-lg border border-gray-200 bg-white p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-4">
                    {product.id ? "Edit product" : "Create product"}
                  </h2>
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      placeholder="Product name"
                      value={product.product_name}
                      onChange={(event) =>
                        setProduct({ ...product, product_name: event.target.value })
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                      placeholder="Price"
                      type="number"
                      value={product.price}
                      onChange={(event) =>
                        setProduct({ ...product, price: event.target.value })
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
                        type="button"
                        onClick={() =>
                          run(() => {
                            if (!product.product_name) {
                              throw new Error("Product name required");
                            }
                            upsertProduct(product);
                            setProduct(blankProduct);
                          }, "Product saved.")
                        }
                      >
                        Save
                      </button>
                      <button
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        type="button"
                        onClick={() => setProduct(blankProduct)}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Product
                        </th>
                        <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Price
                        </th>
                        <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.description || "-"}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                                type="button"
                                onClick={() =>
                                  setProduct({
                                    id: item.id,
                                    product_name: item.product_name || "",
                                    price: item.price || "",
                                    description: item.description || "",
                                  })
                                }
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-md border border-red-200 px-2.5 py-1 text-red-700 hover:bg-red-50"
                                type="button"
                                onClick={() =>
                                  run(() => deleteProduct(item.id), "Product deleted.")
                                }
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-6 py-12 text-center text-sm text-gray-500"
                          >
                            No products match your search.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activeSection === "Billing" && view === "list" && (
            <div className="max-w-[1400px] mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                    Invoices
                  </h1>
                  <p className="text-sm text-gray-500">
                    Track billing status and advertiser payments
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full max-w-[560px]">
                  <div className="relative flex-1">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      size={16}
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
                      placeholder="Search invoices..."
                      value={invoiceSearch}
                      onChange={(event) => setInvoiceSearch(event.target.value)}
                    />
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                    type="button"
                    onClick={() => {
                      setInvoice(blankInvoice);
                      setView("newInvoice");
                    }}
                  >
                    <Plus size={16} />
                    New Invoice
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Invoice
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Advertiser
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Due
                      </th>
                      <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {item.invoice_number || item.id}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {advertisers.find((adv) => adv.id === item.advertiser_id)
                            ?.advertiser_name || "-"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatDate(item.due_date)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.status === "Paid"
                                ? "bg-green-50 text-green-700"
                                : item.status === "Overdue"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              className="rounded-md border border-gray-300 px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                              type="button"
                              onClick={() => {
                                setInvoice({
                                  ...blankInvoice,
                                  ...item,
                                  ad_ids: item.ad_ids || [],
                                });
                                setView("newInvoice");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-red-200 px-2.5 py-1 text-red-700 hover:bg-red-50"
                              type="button"
                              onClick={() =>
                                run(() => deleteInvoice(item.id), "Invoice deleted.")
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-sm text-gray-500"
                        >
                          No invoices match your search.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === "Billing" && view === "newInvoice" && (
            <div className="max-w-[900px] mx-auto">
              <button
                className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                type="button"
                onClick={() => {
                  setView("list");
                  setInvoice(blankInvoice);
                }}
              >
                <ArrowLeft size={16} />
                Back to Billing
              </button>

              <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  {invoice.id ? "Edit Invoice" : "Create Invoice"}
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Select an advertiser and include linked ads for billing
                </p>

                <div className="space-y-4">
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    placeholder="Invoice number"
                    value={invoice.invoice_number}
                    onChange={(event) =>
                      setInvoice({ ...invoice, invoice_number: event.target.value })
                    }
                  />
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    value={invoice.advertiser_id}
                    onChange={(event) =>
                      setInvoice({
                        ...invoice,
                        advertiser_id: event.target.value,
                        ad_ids: [],
                      })
                    }
                  >
                    <option value="">Select advertiser</option>
                    {advertisers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.advertiser_name}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      placeholder="Amount"
                      type="number"
                      value={invoice.amount}
                      onChange={(event) =>
                        setInvoice({ ...invoice, amount: event.target.value })
                      }
                    />
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                      type="date"
                      value={invoice.due_date}
                      onChange={(event) =>
                        setInvoice({ ...invoice, due_date: event.target.value })
                      }
                    />
                  </div>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-gray-400 focus:outline-none"
                    value={invoice.status}
                    onChange={(event) =>
                      setInvoice({ ...invoice, status: event.target.value })
                    }
                  >
                    {["Unpaid", "Paid", "Pending", "Overdue"].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <div className="rounded-lg border border-gray-200 p-3 max-h-40 overflow-auto">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      Link Ads
                    </p>
                    <div className="space-y-1">
                      {visibleAdsForInvoice.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-xs">
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
                          {item.ad_name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
                      type="button"
                      onClick={() =>
                        run(() => {
                          if (!invoice.advertiser_id) {
                            throw new Error("Advertiser required");
                          }
                          if (!invoice.amount) {
                            throw new Error("Amount required");
                          }
                          upsertInvoice(invoice);
                          setInvoice(blankInvoice);
                          setView("list");
                        }, "Invoice saved.")
                      }
                    >
                      Save
                    </button>
                    <button
                      className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      type="button"
                      onClick={() => setInvoice(blankInvoice)}
                    >
                      Reset
                    </button>
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
                  Manage local backups and environment maintenance
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-4">
                    Data Export
                  </h2>
                  <div className="space-y-3">
                    <button
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      type="button"
                      onClick={() =>
                        download(
                          `cbnads-backup-${Date.now()}.json`,
                          exportDbJson(),
                          "application/json",
                        )
                      }
                    >
                      Export local backup (.json)
                    </button>
                    <button
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      type="button"
                      onClick={() =>
                        download(
                          `cbnads-ads-${Date.now()}.csv`,
                          exportAdsCsv(),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      Export ads report (.csv)
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900 mb-4">
                    Dangerous Actions
                  </h2>
                  <button
                    className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm text-red-700 hover:bg-red-50 text-left"
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Reset all local data?")) {
                        return;
                      }
                      run(() => {
                        resetDb();
                        window.location.href = "/account/signin";
                      }, "Data reset.");
                    }}
                  >
                    Reset all local data
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
