"use client";

import { useEffect, useMemo, useState } from "react";
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

const sections = ["ads", "pending", "advertisers", "products", "invoices", "settings"];

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

export default function AdsPage() {
  const [db, setDb] = useState(() => readDb());
  const [section, setSection] = useState(() => {
    if (typeof window === "undefined") return "ads";
    const value = new URLSearchParams(window.location.search).get("section");
    return sections.includes(value) ? value : "ads";
  });
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  const [ad, setAd] = useState(blankAd);
  const [advertiser, setAdvertiser] = useState({ id: "", advertiser_name: "", email: "" });
  const [product, setProduct] = useState({ id: "", product_name: "", price: "" });
  const [invoice, setInvoice] = useState({ id: "", invoice_number: "", advertiser_id: "", amount: "", status: "Unpaid", ad_ids: [] });

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
    if (!ready) return;
    if (!user) window.location.href = "/account/signin";
  }, [ready, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("section", section);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }, [section]);

  const advertisers = db.advertisers || [];
  const products = db.products || [];
  const ads = db.ads || [];
  const pending = db.pending_ads || [];
  const invoices = db.invoices || [];

  const visibleAdsForInvoice = useMemo(() => {
    if (!invoice.advertiser_id) return ads;
    return ads.filter((item) => item.advertiser_id === invoice.advertiser_id);
  }, [ads, invoice.advertiser_id]);

  const run = (fn, text) => {
    try {
      fn();
      setDb(readDb());
      setMessage(text);
      setTimeout(() => setMessage(""), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    }
  };

  const download = (filename, text, type) => {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-600">Loading dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">CBN Ads Admin</h1>
          <a href="/account/logout" className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100">Sign Out</a>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {sections.map((item) => (
            <button key={item} onClick={() => setSection(item)} className={`rounded-lg px-3 py-2 text-sm ${section === item ? "bg-black text-white" : "bg-white border"}`}>
              {item}
            </button>
          ))}
        </div>
        {message ? <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">{message}</div> : null}

        {section === "ads" ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-white p-4">
              <h2 className="mb-3 font-semibold">{ad.id ? "Edit ad" : "Create ad"}</h2>
              <div className="space-y-2 text-sm">
                <input className="w-full rounded border px-2 py-1" placeholder="Ad name" value={ad.ad_name} onChange={(e) => setAd({ ...ad, ad_name: e.target.value })} />
                <select className="w-full rounded border px-2 py-1" value={ad.advertiser_id} onChange={(e) => setAd({ ...ad, advertiser_id: e.target.value })}>
                  <option value="">Select advertiser</option>
                  {advertisers.map((item) => <option key={item.id} value={item.id}>{item.advertiser_name}</option>)}
                </select>
                <select className="w-full rounded border px-2 py-1" value={ad.product_id} onChange={(e) => setAd({ ...ad, product_id: e.target.value })}>
                  <option value="">Select product</option>
                  {products.map((item) => <option key={item.id} value={item.id}>{item.product_name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded border px-2 py-1" type="date" value={ad.post_date} onChange={(e) => setAd({ ...ad, post_date: e.target.value })} />
                  <input className="rounded border px-2 py-1" type="time" value={ad.post_time} onChange={(e) => setAd({ ...ad, post_time: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select className="rounded border px-2 py-1" value={ad.status} onChange={(e) => setAd({ ...ad, status: e.target.value })}>
                    {["Draft", "Scheduled", "Published", "Archived"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select className="rounded border px-2 py-1" value={ad.payment} onChange={(e) => setAd({ ...ad, payment: e.target.value })}>
                    {["Unpaid", "Paid"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <input className="w-full rounded border px-2 py-1" type="number" placeholder="Price" value={ad.price} onChange={(e) => setAd({ ...ad, price: e.target.value })} />
                <textarea className="w-full rounded border px-2 py-1" placeholder="Notes" value={ad.notes} onChange={(e) => setAd({ ...ad, notes: e.target.value })} />
                <div className="flex gap-2">
                  <button className="rounded bg-black px-3 py-2 text-white" onClick={() => run(() => { if (!ad.ad_name) throw new Error("Ad name required"); if (!ad.advertiser_id) throw new Error("Advertiser required"); upsertAd(ad); setAd(blankAd); }, "Ad saved.")}>Save</button>
                  <button className="rounded border px-3 py-2" onClick={() => setAd(blankAd)}>Reset</button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 rounded-xl border bg-white p-4">
              <h2 className="mb-3 font-semibold">Ads ({ads.length})</h2>
              <div className="space-y-2 text-sm">
                {ads.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                    <div>
                      <p className="font-semibold">{item.ad_name}</p>
                      <p className="text-xs text-gray-600">{item.advertiser} - {item.post_date || "No date"} {item.post_time || ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button className="rounded border px-2 py-1" onClick={() => setAd({ ...blankAd, ...item })}>Edit</button>
                      <button className="rounded border px-2 py-1" onClick={() => run(() => updateAdStatus(item.id, "Published"), "Ad published.")}>Publish</button>
                      <button className="rounded border px-2 py-1" onClick={() => run(() => updateAdPayment(item.id, item.payment === "Paid" ? "Unpaid" : "Paid"), "Payment updated.")}>Toggle Pay</button>
                      <button className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={() => run(() => deleteAd(item.id), "Ad deleted.")}>Delete</button>
                    </div>
                  </div>
                ))}
                {ads.length === 0 ? <p className="text-gray-500">No ads yet.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {section === "pending" ? (
          <div className="rounded-xl border bg-white p-4 text-sm">
            <h2 className="mb-3 font-semibold">Pending submissions ({pending.length})</h2>
            <div className="space-y-2">
              {pending.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                  <p>{item.status} - {item.ad_name} - {item.advertiser_name}</p>
                  <div className="flex gap-2 text-xs">
                    {item.status === "pending" ? (
                      <>
                        <button className="rounded border px-2 py-1" onClick={() => run(() => approvePendingAd(item.id), "Submission approved.")}>Approve</button>
                        <button className="rounded border px-2 py-1" onClick={() => run(() => rejectPendingAd(item.id), "Submission rejected.")}>Reject</button>
                      </>
                    ) : null}
                    <button className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={() => run(() => deletePendingAd(item.id), "Submission deleted.")}>Delete</button>
                  </div>
                </div>
              ))}
              {pending.length === 0 ? <p className="text-gray-500">No pending submissions.</p> : null}
            </div>
          </div>
        ) : null}

        {section === "advertisers" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">{advertiser.id ? "Edit advertiser" : "Create advertiser"}</h2>
              <input className="w-full rounded border px-2 py-1" placeholder="Name" value={advertiser.advertiser_name} onChange={(e) => setAdvertiser({ ...advertiser, advertiser_name: e.target.value })} />
              <input className="w-full rounded border px-2 py-1" placeholder="Email" value={advertiser.email} onChange={(e) => setAdvertiser({ ...advertiser, email: e.target.value })} />
              <div className="flex gap-2">
                <button className="rounded bg-black px-3 py-2 text-white" onClick={() => run(() => { if (!advertiser.advertiser_name) throw new Error("Advertiser name required"); upsertAdvertiser(advertiser); setAdvertiser({ id: "", advertiser_name: "", email: "" }); }, "Advertiser saved.")}>Save</button>
                <button className="rounded border px-3 py-2" onClick={() => setAdvertiser({ id: "", advertiser_name: "", email: "" })}>Reset</button>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">Advertisers ({advertisers.length})</h2>
              {advertisers.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border p-2">
                  <p>{item.advertiser_name} - ${item.ad_spend || "0.00"}</p>
                  <div className="flex gap-2 text-xs">
                    <button className="rounded border px-2 py-1" onClick={() => setAdvertiser({ id: item.id, advertiser_name: item.advertiser_name || "", email: item.email || "" })}>Edit</button>
                    <button className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={() => run(() => deleteAdvertiser(item.id), "Advertiser deleted.")}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {section === "products" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">{product.id ? "Edit product" : "Create product"}</h2>
              <input className="w-full rounded border px-2 py-1" placeholder="Product name" value={product.product_name} onChange={(e) => setProduct({ ...product, product_name: e.target.value })} />
              <input className="w-full rounded border px-2 py-1" placeholder="Price" type="number" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} />
              <div className="flex gap-2">
                <button className="rounded bg-black px-3 py-2 text-white" onClick={() => run(() => { if (!product.product_name) throw new Error("Product name required"); upsertProduct(product); setProduct({ id: "", product_name: "", price: "" }); }, "Product saved.")}>Save</button>
                <button className="rounded border px-3 py-2" onClick={() => setProduct({ id: "", product_name: "", price: "" })}>Reset</button>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">Products ({products.length})</h2>
              {products.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border p-2">
                  <p>{item.product_name} - ${item.price}</p>
                  <div className="flex gap-2 text-xs">
                    <button className="rounded border px-2 py-1" onClick={() => setProduct({ id: item.id, product_name: item.product_name || "", price: item.price || "" })}>Edit</button>
                    <button className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={() => run(() => deleteProduct(item.id), "Product deleted.")}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {section === "invoices" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">{invoice.id ? "Edit invoice" : "Create invoice"}</h2>
              <input className="w-full rounded border px-2 py-1" placeholder="Invoice number" value={invoice.invoice_number} onChange={(e) => setInvoice({ ...invoice, invoice_number: e.target.value })} />
              <select className="w-full rounded border px-2 py-1" value={invoice.advertiser_id} onChange={(e) => setInvoice({ ...invoice, advertiser_id: e.target.value, ad_ids: [] })}>
                <option value="">Select advertiser</option>
                {advertisers.map((item) => <option key={item.id} value={item.id}>{item.advertiser_name}</option>)}
              </select>
              <input className="w-full rounded border px-2 py-1" placeholder="Amount" type="number" value={invoice.amount} onChange={(e) => setInvoice({ ...invoice, amount: e.target.value })} />
              <select className="w-full rounded border px-2 py-1" value={invoice.status} onChange={(e) => setInvoice({ ...invoice, status: e.target.value })}>
                {["Unpaid", "Paid"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <div className="max-h-32 overflow-auto rounded border p-2">
                {visibleAdsForInvoice.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={invoice.ad_ids.includes(item.id)} onChange={() => setInvoice((current) => ({ ...current, ad_ids: current.ad_ids.includes(item.id) ? current.ad_ids.filter((id) => id !== item.id) : [...current.ad_ids, item.id] }))} />
                    {item.ad_name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="rounded bg-black px-3 py-2 text-white" onClick={() => run(() => { if (!invoice.advertiser_id) throw new Error("Advertiser required"); if (!invoice.amount) throw new Error("Amount required"); upsertInvoice(invoice); setInvoice({ id: "", invoice_number: "", advertiser_id: "", amount: "", status: "Unpaid", ad_ids: [] }); }, "Invoice saved.")}>Save</button>
                <button className="rounded border px-3 py-2" onClick={() => setInvoice({ id: "", invoice_number: "", advertiser_id: "", amount: "", status: "Unpaid", ad_ids: [] })}>Reset</button>
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4 text-sm space-y-2">
              <h2 className="font-semibold">Invoices ({invoices.length})</h2>
              {invoices.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded border p-2">
                  <p>{item.invoice_number} - ${item.amount} - {item.status}</p>
                  <div className="flex gap-2 text-xs">
                    <button className="rounded border px-2 py-1" onClick={() => setInvoice({ ...item, ad_ids: item.ad_ids || [] })}>Edit</button>
                    <button className="rounded border border-red-200 px-2 py-1 text-red-700" onClick={() => run(() => deleteInvoice(item.id), "Invoice deleted.")}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {section === "settings" ? (
          <div className="rounded-xl border bg-white p-4 space-y-3 text-sm">
            <button className="rounded border px-3 py-2 hover:bg-gray-100" onClick={() => download(`cbnads-backup-${Date.now()}.json`, exportDbJson(), "application/json")}>Export local backup</button>
            <button className="rounded border px-3 py-2 hover:bg-gray-100" onClick={() => download(`cbnads-ads-${Date.now()}.csv`, exportAdsCsv(), "text/csv;charset=utf-8")}>Export ads CSV</button>
            <button className="rounded border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50" onClick={() => { if (window.confirm("Reset all local data?")) run(() => { resetDb(); window.location.href = "/account/signin"; }, "Data reset."); }}>Reset all local data</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
