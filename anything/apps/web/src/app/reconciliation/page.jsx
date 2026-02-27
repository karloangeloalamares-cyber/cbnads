"use client";

import { useEffect, useState } from "react";
import { getSignedInUser } from "@/lib/localAuth";
import { ensureDb, getReconciliationReport, subscribeDb } from "@/lib/localDb";

export default function ReconciliationPage() {
  const [report, setReport] = useState(() => getReconciliationReport());
  const [user, setUser] = useState(() => getSignedInUser());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (cancelled) {
        return;
      }
      setReport(getReconciliationReport());
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
    if (ready && !user) {
      window.location.href = "/account/signin";
    }
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-600">Loading reconciliation...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation</h1>
          <a href="/ads?section=invoices" className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-100">
            Back to Invoices
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Amount mismatches" value={report.summary.totalDiscrepancies} />
          <Stat label="Paid ads without invoice" value={report.summary.totalOrphanedAds} />
          <Stat label="Missing invoice links" value={report.summary.totalDeletedInvoiceAds} />
        </div>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold text-gray-900">Invoice mismatches</h2>
          {report.discrepancies.length === 0 ? (
            <p className="text-sm text-gray-600">No mismatches found.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {report.discrepancies.map((item) => (
                <div key={item.invoice_id} className="rounded border p-2">
                  <p className="font-medium">
                    {item.invoice_number} - {item.advertiser_name}
                  </p>
                  <p className="text-gray-700">
                    Invoice: ${item.invoice_total} - Ads: ${item.ads_total} - Difference: ${item.difference}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-semibold text-gray-900">Paid ads without invoice</h2>
          {report.orphanedPaidAds.length === 0 ? (
            <p className="text-sm text-gray-600">No orphaned paid ads.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {report.orphanedPaidAds.map((item) => (
                <div key={item.id} className="rounded border p-2">
                  {item.ad_name} - {item.advertiser}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
