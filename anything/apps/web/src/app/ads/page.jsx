"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  LogOut,
  ChevronDown,
  Settings,
  ArrowLeft,
  Plus,
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
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
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
    const paidRevenue = ads
      .filter((item) => item.payment === "Paid")
      .reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    return {
      totalAds: ads.length,
      pendingSubmissions: pending.filter((item) => item.status === "pending")
        .length,
      activeAdvertisers: advertisers.length,
      paidRevenue,
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

  if (!ready || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-600">Loading dashboard...</p>
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
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard label="Total Ads" value={dashboardStats.totalAds} />
                <StatCard
                  label="Pending Submissions"
                  value={dashboardStats.pendingSubmissions}
                />
                <StatCard
                  label="Active Advertisers"
                  value={dashboardStats.activeAdvertisers}
                />
                <StatCard
                  label="Paid Revenue"
                  value={formatCurrency(dashboardStats.paidRevenue)}
                />
                <StatCard
                  label="Overdue Invoices"
                  value={dashboardStats.overdueInvoices}
                />
              </div>
            </div>
          )}

          {activeSection === "Calendar" && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
              <div className="rounded-xl border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3">Ad</th>
                      <th className="text-left px-4 py-3">Advertiser</th>
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingAds.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-4 py-3">{item.ad_name}</td>
                        <td className="px-4 py-3">{item.advertiser || "-"}</td>
                        <td className="px-4 py-3">{formatDate(item.post_date)}</td>
                        <td className="px-4 py-3">{item.post_time || "-"}</td>
                        <td className="px-4 py-3">{item.status}</td>
                      </tr>
                    ))}
                    {upcomingAds.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-gray-500"
                        >
                          No upcoming ads.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === "Submissions" && (
            <div className="rounded-xl border bg-white p-4 text-sm">
              <h2 className="mb-3 font-semibold">
                Pending submissions ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
                  >
                    <p>
                      {item.status} - {item.ad_name} - {item.advertiser_name}
                    </p>
                    <div className="flex gap-2 text-xs">
                      {item.status === "pending" ? (
                        <>
                          <button
                            className="rounded border px-2 py-1"
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
                            className="rounded border px-2 py-1"
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
                        className="rounded border border-red-200 px-2 py-1 text-red-700"
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
                  </div>
                ))}
                {pending.length === 0 ? (
                  <p className="text-gray-500">No pending submissions.</p>
                ) : null}
              </div>
            </div>
          )}

          {activeSection === "Ads" && view === "list" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Ads</h1>
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

              <div className="rounded-xl border bg-white p-4">
                <div className="space-y-2 text-sm">
                  {ads.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
                    >
                      <div>
                        <p className="font-semibold">{item.ad_name}</p>
                        <p className="text-xs text-gray-600">
                          {item.advertiser} - {item.post_date || "No date"}{" "}
                          {item.post_time || ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          className="rounded border px-2 py-1"
                          type="button"
                          onClick={() => {
                            setAd({ ...blankAd, ...item });
                            setView("createAd");
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded border px-2 py-1"
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
                          className="rounded border px-2 py-1"
                          type="button"
                          onClick={() =>
                            run(
                              () =>
                                updateAdPayment(
                                  item.id,
                                  item.payment === "Paid" ? "Unpaid" : "Paid",
                                ),
                              "Payment updated.",
                            )
                          }
                        >
                          Toggle Pay
                        </button>
                        <button
                          className="rounded border border-red-200 px-2 py-1 text-red-700"
                          type="button"
                          onClick={() =>
                            run(() => deleteAd(item.id), "Ad deleted.")
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {ads.length === 0 ? (
                    <p className="text-gray-500">No ads yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
          {activeSection === "Ads" && view === "createAd" && (
            <div className="max-w-3xl space-y-4">
              <button
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-100"
                type="button"
                onClick={() => {
                  setView("list");
                  setAd(blankAd);
                }}
              >
                <ArrowLeft size={16} />
                Back to Ads
              </button>

              <div className="rounded-xl border bg-white p-4">
                <h2 className="mb-3 font-semibold">
                  {ad.id ? "Edit ad" : "Create ad"}
                </h2>
                <div className="space-y-2 text-sm">
                  <input
                    className="w-full rounded border px-2 py-1"
                    placeholder="Ad name"
                    value={ad.ad_name}
                    onChange={(event) =>
                      setAd({ ...ad, ad_name: event.target.value })
                    }
                  />
                  <select
                    className="w-full rounded border px-2 py-1"
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
                    className="w-full rounded border px-2 py-1"
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="rounded border px-2 py-1"
                      type="date"
                      value={ad.post_date}
                      onChange={(event) =>
                        setAd({ ...ad, post_date: event.target.value })
                      }
                    />
                    <input
                      className="rounded border px-2 py-1"
                      type="time"
                      value={ad.post_time}
                      onChange={(event) =>
                        setAd({ ...ad, post_time: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="rounded border px-2 py-1"
                      value={ad.status}
                      onChange={(event) =>
                        setAd({ ...ad, status: event.target.value })
                      }
                    >
                      {[
                        "Draft",
                        "Scheduled",
                        "Published",
                        "Archived",
                      ].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded border px-2 py-1"
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
                    className="w-full rounded border px-2 py-1"
                    type="number"
                    placeholder="Price"
                    value={ad.price}
                    onChange={(event) =>
                      setAd({ ...ad, price: event.target.value })
                    }
                  />
                  <textarea
                    className="w-full rounded border px-2 py-1"
                    placeholder="Notes"
                    value={ad.notes}
                    onChange={(event) =>
                      setAd({ ...ad, notes: event.target.value })
                    }
                  />
                  <div className="flex gap-2">
                    <button
                      className="rounded bg-black px-3 py-2 text-white"
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
                      className="rounded border px-3 py-2"
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
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                <h2 className="font-semibold">
                  {advertiser.id ? "Edit advertiser" : "Create advertiser"}
                </h2>
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Name"
                  value={advertiser.advertiser_name}
                  onChange={(event) =>
                    setAdvertiser({
                      ...advertiser,
                      advertiser_name: event.target.value,
                    })
                  }
                />
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Email"
                  value={advertiser.email}
                  onChange={(event) =>
                    setAdvertiser({ ...advertiser, email: event.target.value })
                  }
                />
                <div className="flex gap-2">
                  <button
                    className="rounded bg-black px-3 py-2 text-white"
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
                    className="rounded border px-3 py-2"
                    type="button"
                    onClick={() => setAdvertiser(blankAdvertiser)}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                <h2 className="font-semibold">Advertisers ({advertisers.length})</h2>
                {advertisers.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border p-2"
                  >
                    <p>
                      {item.advertiser_name} -{" "}
                      {formatCurrency(item.ad_spend || 0)}
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button
                        className="rounded border px-2 py-1"
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
                        className="rounded border border-red-200 px-2 py-1 text-red-700"
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "Products" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                <h2 className="font-semibold">
                  {product.id ? "Edit product" : "Create product"}
                </h2>
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Product name"
                  value={product.product_name}
                  onChange={(event) =>
                    setProduct({ ...product, product_name: event.target.value })
                  }
                />
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Price"
                  type="number"
                  value={product.price}
                  onChange={(event) =>
                    setProduct({ ...product, price: event.target.value })
                  }
                />
                <div className="flex gap-2">
                  <button
                    className="rounded bg-black px-3 py-2 text-white"
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
                    className="rounded border px-3 py-2"
                    type="button"
                    onClick={() => setProduct(blankProduct)}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                <h2 className="font-semibold">Products ({products.length})</h2>
                {products.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border p-2"
                  >
                    <p>
                      {item.product_name} - {formatCurrency(item.price)}
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button
                        className="rounded border px-2 py-1"
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
                        className="rounded border border-red-200 px-2 py-1 text-red-700"
                        type="button"
                        onClick={() =>
                          run(() => deleteProduct(item.id), "Product deleted.")
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeSection === "Billing" && view === "list" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
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

              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                {invoices.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded border p-2"
                  >
                    <p>
                      {item.invoice_number} - {formatCurrency(item.amount)} -{" "}
                      {item.status}
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button
                        className="rounded border px-2 py-1"
                        type="button"
                        onClick={() =>
                          setInvoice({
                            ...blankInvoice,
                            ...item,
                            ad_ids: item.ad_ids || [],
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="rounded border border-red-200 px-2 py-1 text-red-700"
                        type="button"
                        onClick={() =>
                          run(() => deleteInvoice(item.id), "Invoice deleted.")
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {invoices.length === 0 ? (
                  <p className="text-gray-500">No invoices yet.</p>
                ) : null}
              </div>
            </div>
          )}

          {activeSection === "Billing" && view === "newInvoice" && (
            <div className="max-w-3xl space-y-4">
              <button
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-100"
                type="button"
                onClick={() => {
                  setView("list");
                  setInvoice(blankInvoice);
                }}
              >
                <ArrowLeft size={16} />
                Back to Billing
              </button>

              <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
                <h2 className="font-semibold">
                  {invoice.id ? "Edit invoice" : "Create invoice"}
                </h2>
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Invoice number"
                  value={invoice.invoice_number}
                  onChange={(event) =>
                    setInvoice({ ...invoice, invoice_number: event.target.value })
                  }
                />
                <select
                  className="w-full rounded border px-2 py-1"
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
                <input
                  className="w-full rounded border px-2 py-1"
                  placeholder="Amount"
                  type="number"
                  value={invoice.amount}
                  onChange={(event) =>
                    setInvoice({ ...invoice, amount: event.target.value })
                  }
                />
                <input
                  className="w-full rounded border px-2 py-1"
                  type="date"
                  value={invoice.due_date}
                  onChange={(event) =>
                    setInvoice({ ...invoice, due_date: event.target.value })
                  }
                />
                <select
                  className="w-full rounded border px-2 py-1"
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
                <div className="max-h-32 overflow-auto rounded border p-2">
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
                <div className="flex gap-2">
                  <button
                    className="rounded bg-black px-3 py-2 text-white"
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
                    className="rounded border px-3 py-2"
                    type="button"
                    onClick={() => setInvoice(blankInvoice)}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "Reconciliation" && (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold text-gray-900">
                Reconciliation
              </h1>
              <div className="grid gap-4 sm:grid-cols-3">
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

              <div className="rounded-xl border bg-white p-4 text-sm">
                <h2 className="font-semibold mb-2">Discrepancies</h2>
                {reconciliation.discrepancies.length === 0 ? (
                  <p className="text-gray-500">No discrepancies found.</p>
                ) : (
                  <div className="space-y-2">
                    {reconciliation.discrepancies.map((item) => (
                      <div key={item.invoice_id} className="rounded border p-2">
                        {item.invoice_number} ({item.advertiser_name}) - Difference:{" "}
                        {formatCurrency(item.difference)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "Settings" && (
            <div className="rounded-xl border bg-white p-4 space-y-3 text-sm max-w-xl">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Settings
              </h1>
              <button
                className="rounded border px-3 py-2 hover:bg-gray-100"
                type="button"
                onClick={() =>
                  download(
                    `cbnads-backup-${Date.now()}.json`,
                    exportDbJson(),
                    "application/json",
                  )
                }
              >
                Export local backup
              </button>
              <button
                className="rounded border px-3 py-2 hover:bg-gray-100"
                type="button"
                onClick={() =>
                  download(
                    `cbnads-ads-${Date.now()}.csv`,
                    exportAdsCsv(),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Export ads CSV
              </button>
              <button
                className="rounded border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50"
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
          )}
        </main>
      </div>
    </div>
  );
}
