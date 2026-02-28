// AUTO-GENERATED: Consolidates all React Router APIs into a single Vercel Serverless Function
import * as route_0 from "../src/app/api/invoices/route.js";
import * as route_1 from "../src/app/api/submissions/route.js";
import * as route_2 from "../src/app/api/ads/archive/route.js";
import * as route_3 from "../src/app/api/ads/availability/route.js";
import * as route_4 from "../src/app/api/ads/availability-batch/route.js";
import * as route_5 from "../src/app/api/ads/bulk-action/route.js";
import * as route_6 from "../src/app/api/ads/calendar/route.js";
import * as route_7 from "../src/app/api/ads/delete/route.js";
import * as route_8 from "../src/app/api/ads/create/route.js";
import * as route_9 from "../src/app/api/ads/export/route.js";
import * as route_10 from "../src/app/api/ads/list/route.js";
import * as route_11 from "../src/app/api/ads/mark-published/route.js";
import * as route_12 from "../src/app/api/ads/update/route.js";
import * as route_13 from "../src/app/api/admin/fix-all-spending/route.js";
import * as route_14 from "../src/app/api/admin/members/route.js";
import * as route_15 from "../src/app/api/admin/notification-preferences/route.js";
import * as route_16 from "../src/app/api/admin/send-reminders/route.js";
import * as route_17 from "../src/app/api/admin/send-test-email/route.js";
import * as route_18 from "../src/app/api/admin/settings/route.js";
import * as route_19 from "../src/app/api/admin/sync-advertiser-spending/route.js";
import * as route_20 from "../src/app/api/advertisers/create/route.js";
import * as route_21 from "../src/app/api/advertisers/list/route.js";
import * as route_22 from "../src/app/api/advertisers/[id]/route.js";
import * as route_23 from "../src/app/api/auth/expo-web-success/route.js";
import * as route_24 from "../src/app/api/auth/token/route.js";
import * as route_25 from "../src/app/api/invoices/batch-create/route.js";
import * as route_26 from "../src/app/api/invoices/create/route.js";
import * as route_27 from "../src/app/api/invoices/create-from-ads/route.js";
import * as route_28 from "../src/app/api/invoices/generate-recurring/route.js";
import * as route_29 from "../src/app/api/invoices/validate-amounts/route.js";
import * as route_30 from "../src/app/api/products/create/route.js";
import * as route_31 from "../src/app/api/products/list/route.js";
import * as route_32 from "../src/app/api/products/[id]/route.js";
import * as route_33 from "../src/app/api/public/submit-ad/route.js";
import * as route_34 from "../src/app/api/user/profile/route.js";
import * as route_35 from "../src/app/api/user/role/route.js";
import * as route_36 from "../src/app/api/__create/ssr-test/route.js";
import * as route_37 from "../src/app/api/ads/[id]/invoices/route.js";
import * as route_38 from "../src/app/api/admin/members/[id]/route.js";
import * as route_39 from "../src/app/api/admin/pending-ads/approve/route.js";
import * as route_40 from "../src/app/api/admin/pending-ads/cleanup/route.js";
import * as route_41 from "../src/app/api/admin/pending-ads/list/route.js";
import * as route_42 from "../src/app/api/admin/pending-ads/mark-read/route.js";
import * as route_43 from "../src/app/api/admin/pending-ads/reject/route.js";
import * as route_44 from "../src/app/api/admin/pending-ads/unread-count/route.js";
import * as route_45 from "../src/app/api/admin/pending-ads/[id]/route.js";
import * as route_46 from "../src/app/api/public/submit-ad/account/route.js";
import * as route_47 from "../src/app/api/public/submit-ad/resend-verification/route.js";
import * as route_48 from "../src/app/api/public/submit-ad/verify-account/route.js";
import { handleRouteRequest } from "../vercel-api/adapter.js";

const routes = [
  { regex: new RegExp("^/api/public/submit\\-ad/resend\\-verification$"), module: route_47 },
  { regex: new RegExp("^/api/public/submit\\-ad/verify\\-account$"), module: route_48 },
  { regex: new RegExp("^/api/admin/pending\\-ads/unread\\-count$"), module: route_44 },
  { regex: new RegExp("^/api/admin/pending\\-ads/mark\\-read$"), module: route_42 },
  { regex: new RegExp("^/api/admin/pending\\-ads/approve$"), module: route_39 },
  { regex: new RegExp("^/api/admin/pending\\-ads/cleanup$"), module: route_40 },
  { regex: new RegExp("^/api/admin/pending\\-ads/reject$"), module: route_43 },
  { regex: new RegExp("^/api/public/submit\\-ad/account$"), module: route_46 },
  { regex: new RegExp("^/api/admin/pending\\-ads/list$"), module: route_41 },
  { regex: new RegExp("^/api/admin/pending\\-ads/(?<id>[^/]+)$"), module: route_45 },
  { regex: new RegExp("^/api/admin/members/(?<id>[^/]+)$"), module: route_38 },
  { regex: new RegExp("^/api/ads/(?<id>[^/]+)/invoices$"), module: route_37 },
  { regex: new RegExp("^/api/admin/notification\\-preferences$"), module: route_15 },
  { regex: new RegExp("^/api/admin/sync\\-advertiser\\-spending$"), module: route_19 },
  { regex: new RegExp("^/api/invoices/generate\\-recurring$"), module: route_28 },
  { regex: new RegExp("^/api/invoices/validate\\-amounts$"), module: route_29 },
  { regex: new RegExp("^/api/invoices/create\\-from\\-ads$"), module: route_27 },
  { regex: new RegExp("^/api/ads/availability\\-batch$"), module: route_4 },
  { regex: new RegExp("^/api/admin/fix\\-all\\-spending$"), module: route_13 },
  { regex: new RegExp("^/api/admin/send\\-test\\-email$"), module: route_17 },
  { regex: new RegExp("^/api/auth/expo\\-web\\-success$"), module: route_23 },
  { regex: new RegExp("^/api/invoices/batch\\-create$"), module: route_25 },
  { regex: new RegExp("^/api/admin/send\\-reminders$"), module: route_16 },
  { regex: new RegExp("^/api/ads/mark\\-published$"), module: route_11 },
  { regex: new RegExp("^/api/advertisers/create$"), module: route_20 },
  { regex: new RegExp("^/api/__create/ssr\\-test$"), module: route_36 },
  { regex: new RegExp("^/api/ads/availability$"), module: route_3 },
  { regex: new RegExp("^/api/advertisers/list$"), module: route_21 },
  { regex: new RegExp("^/api/public/submit\\-ad$"), module: route_33 },
  { regex: new RegExp("^/api/ads/bulk\\-action$"), module: route_5 },
  { regex: new RegExp("^/api/invoices/create$"), module: route_26 },
  { regex: new RegExp("^/api/products/create$"), module: route_30 },
  { regex: new RegExp("^/api/admin/settings$"), module: route_18 },
  { regex: new RegExp("^/api/admin/members$"), module: route_14 },
  { regex: new RegExp("^/api/products/list$"), module: route_31 },
  { regex: new RegExp("^/api/ads/calendar$"), module: route_6 },
  { regex: new RegExp("^/api/user/profile$"), module: route_34 },
  { regex: new RegExp("^/api/ads/archive$"), module: route_2 },
  { regex: new RegExp("^/api/ads/delete$"), module: route_7 },
  { regex: new RegExp("^/api/ads/create$"), module: route_8 },
  { regex: new RegExp("^/api/ads/export$"), module: route_9 },
  { regex: new RegExp("^/api/ads/update$"), module: route_12 },
  { regex: new RegExp("^/api/auth/token$"), module: route_24 },
  { regex: new RegExp("^/api/user/role$"), module: route_35 },
  { regex: new RegExp("^/api/ads/list$"), module: route_10 },
  { regex: new RegExp("^/api/advertisers/(?<id>[^/]+)$"), module: route_22 },
  { regex: new RegExp("^/api/products/(?<id>[^/]+)$"), module: route_32 },
  { regex: new RegExp("^/api/submissions$"), module: route_1 },
  { regex: new RegExp("^/api/invoices$"), module: route_0 }
];

export default async function handler(req, res) {
  // Parse URL to get pathname
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `${proto}://${host}`);
  let pathname = url.pathname;
  if (!pathname.startsWith("/api")) {
      pathname = "/api" + (pathname === "/" ? "" : pathname);
  }

  // Find matching route
  for (const route of routes) {
    const match = route.regex.exec(pathname);
    if (match) {
      const params = match.groups || {};
      return handleRouteRequest(req, res, route.module, params);
    }
  }

  // No match
  res.statusCode = 404;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "API Route Not Found" }));
}
