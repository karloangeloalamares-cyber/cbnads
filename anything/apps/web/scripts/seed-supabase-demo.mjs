import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ENV_PATH = path.resolve(process.cwd(), ".env.local");

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const normalizeNamespace = (value) => {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "cbnads_web";
};

const envFile = parseEnvFile(ENV_PATH);
const env = { ...envFile, ...process.env };

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const namespace = normalizeNamespace(env.VITE_APP_DATA_NAMESPACE || "cbnads_web");
const table = (name) => `${namespace}_${name}`;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date();
const isoAt = (daysOffset, hour = 9, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const dateAt = (daysOffset) => isoAt(daysOffset).slice(0, 10);

const ids = {
  advertisers: {
    greenLeaf: "11111111-1111-4111-8111-111111111111",
    urbanBites: "11111111-1111-4111-8111-222222222222",
    techNova: "11111111-1111-4111-8111-333333333333",
  },
  products: {
    waStandard: "22222222-2222-4222-8222-111111111111",
    waPremium: "22222222-2222-4222-8222-222222222222",
    webBanner: "22222222-2222-4222-8222-333333333333",
  },
  ads: {
    a1: "33333333-3333-4333-8333-111111111111",
    a2: "33333333-3333-4333-8333-222222222222",
    a3: "33333333-3333-4333-8333-333333333333",
    a4: "33333333-3333-4333-8333-444444444444",
    a5: "33333333-3333-4333-8333-555555555555",
    a6: "33333333-3333-4333-8333-666666666666",
  },
  invoices: {
    i1: "44444444-4444-4444-8444-111111111111",
    i2: "44444444-4444-4444-8444-222222222222",
    i3: "44444444-4444-4444-8444-333333333333",
  },
  invoiceItems: {
    ii1: "55555555-5555-4555-8555-111111111111",
    ii2: "55555555-5555-4555-8555-222222222222",
    ii3: "55555555-5555-4555-8555-333333333333",
    ii4: "55555555-5555-4555-8555-444444444444",
    ii5: "55555555-5555-4555-8555-555555555555",
    ii6: "55555555-5555-4555-8555-666666666666",
  },
  pendingAds: {
    p1: "66666666-6666-4666-8666-111111111111",
    p2: "66666666-6666-4666-8666-222222222222",
  },
  teamMembers: {
    m1: "77777777-7777-4777-8777-111111111111",
    m2: "77777777-7777-4777-8777-222222222222",
  },
  reminders: {
    r1: "88888888-8888-4888-8888-111111111111",
  },
};

const advertisers = [
  {
    id: ids.advertisers.greenLeaf,
    advertiser_name: "GreenLeaf Organics",
    contact_name: "Sarah Mitchell",
    email: "sarah@greenleaf.test",
    phone: "+1 555-0101",
    phone_number: "+1 555-0101",
    business_name: "GreenLeaf Organics LLC",
    ad_spend: "100.00",
    total_spend: "100.00",
    status: "active",
    next_ad_date: dateAt(3),
    created_at: isoAt(-45, 9),
    updated_at: isoAt(-1, 10),
  },
  {
    id: ids.advertisers.urbanBites,
    advertiser_name: "Urban Bites",
    contact_name: "Marcus Chen",
    email: "marcus@urbanbites.test",
    phone: "+1 555-0202",
    phone_number: "+1 555-0202",
    business_name: "Urban Bites Group",
    ad_spend: "175.00",
    total_spend: "175.00",
    status: "active",
    next_ad_date: dateAt(7),
    created_at: isoAt(-35, 10),
    updated_at: isoAt(-1, 11),
  },
  {
    id: ids.advertisers.techNova,
    advertiser_name: "TechNova Solutions",
    contact_name: "Jessica Park",
    email: "jessica@technova.test",
    phone: "+1 555-0303",
    phone_number: "+1 555-0303",
    business_name: "TechNova Solutions Inc.",
    ad_spend: "200.00",
    total_spend: "200.00",
    status: "active",
    next_ad_date: dateAt(2),
    created_at: isoAt(-25, 8),
    updated_at: isoAt(-1, 12),
  },
];

const products = [
  {
    id: ids.products.waStandard,
    product_name: "WhatsApp Ad - Standard",
    placement: "WhatsApp",
    price: "25.00",
    description: "Single WhatsApp status placement.",
    created_at: isoAt(-60, 9),
    updated_at: isoAt(-1, 9),
  },
  {
    id: ids.products.waPremium,
    product_name: "WhatsApp Ad - Premium",
    placement: "WhatsApp",
    price: "75.00",
    description: "7-day WhatsApp campaign package.",
    created_at: isoAt(-60, 9),
    updated_at: isoAt(-1, 9),
  },
  {
    id: ids.products.webBanner,
    product_name: "Website Banner Ad",
    placement: "Website",
    price: "150.00",
    description: "Homepage banner for 30 days.",
    created_at: isoAt(-60, 9),
    updated_at: isoAt(-1, 9),
  },
];

const invoices = [
  {
    id: ids.invoices.i1,
    invoice_number: "DEMO-INV-1001",
    advertiser_id: ids.advertisers.greenLeaf,
    advertiser_name: "GreenLeaf Organics",
    contact_name: "Sarah Mitchell",
    contact_email: "sarah@greenleaf.test",
    bill_to: "GreenLeaf Organics LLC",
    issue_date: dateAt(-10),
    due_date: dateAt(-3),
    status: "Paid",
    amount: "100.00",
    discount: "0.00",
    tax: "0.00",
    total: "100.00",
    amount_paid: "100.00",
    paid_date: dateAt(-4),
    ad_ids: [ids.ads.a1, ids.ads.a2],
    notes: "Demo paid invoice",
    is_recurring: false,
    created_at: isoAt(-10, 10),
    updated_at: isoAt(-4, 11),
  },
  {
    id: ids.invoices.i2,
    invoice_number: "DEMO-INV-1002",
    advertiser_id: ids.advertisers.urbanBites,
    advertiser_name: "Urban Bites",
    contact_name: "Marcus Chen",
    contact_email: "marcus@urbanbites.test",
    bill_to: "Urban Bites Group",
    issue_date: dateAt(-9),
    due_date: dateAt(-1),
    status: "Paid",
    amount: "175.00",
    discount: "0.00",
    tax: "0.00",
    total: "175.00",
    amount_paid: "175.00",
    paid_date: dateAt(-2),
    ad_ids: [ids.ads.a3, ids.ads.a4],
    notes: "Demo paid invoice",
    is_recurring: false,
    created_at: isoAt(-9, 10),
    updated_at: isoAt(-2, 11),
  },
  {
    id: ids.invoices.i3,
    invoice_number: "DEMO-INV-1003",
    advertiser_id: ids.advertisers.techNova,
    advertiser_name: "TechNova Solutions",
    contact_name: "Jessica Park",
    contact_email: "jessica@technova.test",
    bill_to: "TechNova Solutions Inc.",
    issue_date: dateAt(-2),
    due_date: dateAt(7),
    status: "Unpaid",
    amount: "200.00",
    discount: "0.00",
    tax: "0.00",
    total: "200.00",
    amount_paid: "0.00",
    ad_ids: [ids.ads.a5, ids.ads.a6],
    notes: "Demo unpaid invoice",
    is_recurring: false,
    created_at: isoAt(-2, 9),
    updated_at: isoAt(-1, 12),
  },
];

const ads = [
  {
    id: ids.ads.a1,
    ad_name: "Spring Organic Sale",
    advertiser_id: ids.advertisers.greenLeaf,
    advertiser: "GreenLeaf Organics",
    product_id: ids.products.waPremium,
    product_name: "WhatsApp Ad - Premium",
    post_type: "daily_run",
    status: "Posted",
    payment: "Paid",
    post_date: dateAt(-3),
    post_date_from: dateAt(-3),
    post_date_to: dateAt(3),
    post_time: "09:00",
    custom_dates: [],
    placement: "WhatsApp",
    ad_text: "Fresh organic produce delivered this week.",
    notes: "Morning posting window.",
    reminder_minutes: 60,
    price: "75.00",
    media: [],
    media_urls: [],
    schedule: dateAt(-3),
    archived: false,
    published_at: isoAt(-3, 9),
    published_dates: [dateAt(-3), dateAt(-2), dateAt(-1), dateAt(0)],
    paid_via_invoice_id: ids.invoices.i1,
    invoice_id: ids.invoices.i1,
    created_at: isoAt(-5, 10),
    updated_at: isoAt(-1, 9),
  },
  {
    id: ids.ads.a2,
    ad_name: "Summer Harvest Preview",
    advertiser_id: ids.advertisers.greenLeaf,
    advertiser: "GreenLeaf Organics",
    product_id: ids.products.waStandard,
    product_name: "WhatsApp Ad - Standard",
    post_type: "one_time",
    status: "Scheduled",
    payment: "Paid",
    post_date: dateAt(3),
    post_date_from: dateAt(3),
    post_time: "10:00",
    custom_dates: [],
    placement: "WhatsApp",
    ad_text: "Pre-order your summer organic box.",
    notes: "",
    reminder_minutes: 30,
    price: "25.00",
    media: [],
    media_urls: [],
    schedule: dateAt(3),
    archived: false,
    published_dates: [],
    paid_via_invoice_id: ids.invoices.i1,
    invoice_id: ids.invoices.i1,
    created_at: isoAt(-2, 14),
    updated_at: isoAt(-1, 9),
  },
  {
    id: ids.ads.a3,
    ad_name: "Weekend Brunch Special",
    advertiser_id: ids.advertisers.urbanBites,
    advertiser: "Urban Bites",
    product_id: ids.products.waStandard,
    product_name: "WhatsApp Ad - Standard",
    post_type: "one_time",
    status: "Completed",
    payment: "Paid",
    post_date: dateAt(-7),
    post_date_from: dateAt(-7),
    post_time: "08:00",
    custom_dates: [],
    placement: "WhatsApp",
    ad_text: "Weekend brunch promo.",
    notes: "Completed run.",
    reminder_minutes: 60,
    price: "25.00",
    media: [],
    media_urls: [],
    schedule: dateAt(-7),
    archived: false,
    published_at: isoAt(-7, 8),
    published_dates: [dateAt(-7)],
    paid_via_invoice_id: ids.invoices.i2,
    invoice_id: ids.invoices.i2,
    created_at: isoAt(-10, 9),
    updated_at: isoAt(-7, 9),
  },
  {
    id: ids.ads.a4,
    ad_name: "Urban Bites New Menu Banner",
    advertiser_id: ids.advertisers.urbanBites,
    advertiser: "Urban Bites",
    product_id: ids.products.webBanner,
    product_name: "Website Banner Ad",
    post_type: "daily_run",
    status: "Posted",
    payment: "Paid",
    post_date: dateAt(-10),
    post_date_from: dateAt(-10),
    post_date_to: dateAt(20),
    custom_dates: [],
    placement: "Website",
    ad_text: "New menu now live.",
    notes: "Homepage 728x90.",
    reminder_minutes: 60,
    price: "150.00",
    media: [],
    media_urls: [],
    schedule: dateAt(-10),
    archived: false,
    published_dates: [],
    paid_via_invoice_id: ids.invoices.i2,
    invoice_id: ids.invoices.i2,
    created_at: isoAt(-12, 11),
    updated_at: isoAt(-1, 12),
  },
  {
    id: ids.ads.a5,
    ad_name: "TechNova Product Launch",
    advertiser_id: ids.advertisers.techNova,
    advertiser: "TechNova Solutions",
    product_id: ids.products.webBanner,
    product_name: "Website Banner Ad",
    post_type: "custom_schedule",
    status: "Approved",
    payment: "Unpaid",
    post_date: dateAt(2),
    post_date_from: dateAt(2),
    post_time: "11:00",
    custom_dates: [dateAt(2), dateAt(4), dateAt(6)],
    placement: "Both",
    ad_text: "AI suite launch campaign.",
    notes: "Custom dates around launch week.",
    reminder_minutes: 120,
    price: "150.00",
    media: [],
    media_urls: [],
    schedule: dateAt(2),
    archived: false,
    published_dates: [],
    invoice_id: ids.invoices.i3,
    created_at: isoAt(-4, 16),
    updated_at: isoAt(-1, 12),
  },
  {
    id: ids.ads.a6,
    ad_name: "TechNova Webinar Promo",
    advertiser_id: ids.advertisers.techNova,
    advertiser: "TechNova Solutions",
    product_id: ids.products.waStandard,
    product_name: "WhatsApp Ad - Standard",
    post_type: "one_time",
    status: "Draft",
    payment: "Unpaid",
    post_date: dateAt(7),
    post_date_from: dateAt(7),
    post_time: "14:00",
    custom_dates: [],
    placement: "WhatsApp",
    ad_text: "Webinar registration now open.",
    notes: "Draft copy.",
    reminder_minutes: 60,
    price: "25.00",
    media: [],
    media_urls: [],
    schedule: dateAt(7),
    archived: false,
    published_dates: [],
    invoice_id: ids.invoices.i3,
    created_at: isoAt(-1, 10),
    updated_at: isoAt(-1, 12),
  },
];

const invoiceItems = [
  {
    id: ids.invoiceItems.ii1,
    invoice_id: ids.invoices.i1,
    ad_id: ids.ads.a1,
    product_id: ids.products.waPremium,
    description: "WhatsApp Ad - Premium",
    quantity: 1,
    unit_price: "75.00",
    amount: "75.00",
    created_at: isoAt(-10, 10),
  },
  {
    id: ids.invoiceItems.ii2,
    invoice_id: ids.invoices.i1,
    ad_id: ids.ads.a2,
    product_id: ids.products.waStandard,
    description: "WhatsApp Ad - Standard",
    quantity: 1,
    unit_price: "25.00",
    amount: "25.00",
    created_at: isoAt(-10, 10),
  },
  {
    id: ids.invoiceItems.ii3,
    invoice_id: ids.invoices.i2,
    ad_id: ids.ads.a3,
    product_id: ids.products.waStandard,
    description: "WhatsApp Ad - Standard",
    quantity: 1,
    unit_price: "25.00",
    amount: "25.00",
    created_at: isoAt(-9, 10),
  },
  {
    id: ids.invoiceItems.ii4,
    invoice_id: ids.invoices.i2,
    ad_id: ids.ads.a4,
    product_id: ids.products.webBanner,
    description: "Website Banner Ad",
    quantity: 1,
    unit_price: "150.00",
    amount: "150.00",
    created_at: isoAt(-9, 10),
  },
  {
    id: ids.invoiceItems.ii5,
    invoice_id: ids.invoices.i3,
    ad_id: ids.ads.a5,
    product_id: ids.products.webBanner,
    description: "Website Banner Ad",
    quantity: 1,
    unit_price: "150.00",
    amount: "150.00",
    created_at: isoAt(-2, 9),
  },
  {
    id: ids.invoiceItems.ii6,
    invoice_id: ids.invoices.i3,
    ad_id: ids.ads.a6,
    product_id: ids.products.waStandard,
    description: "WhatsApp Ad - Standard",
    quantity: 1,
    unit_price: "25.00",
    amount: "25.00",
    created_at: isoAt(-2, 9),
  },
];

const pendingAds = [
  {
    id: ids.pendingAds.p1,
    advertiser_name: "FitZone Gym",
    contact_name: "Carlos Ramirez",
    email: "carlos@fitzone.test",
    phone: "+1 555-0606",
    phone_number: "+1 555-0606",
    business_name: "FitZone Fitness Center",
    ad_name: "Summer Membership Drive",
    post_type: "one_time",
    post_date: dateAt(5),
    post_date_from: dateAt(5),
    post_time: "07:00",
    custom_dates: [],
    reminder_minutes: 30,
    ad_text: "Join this summer and get one free month.",
    media: [],
    placement: "WhatsApp",
    notes: "Morning slot preferred.",
    status: "pending",
    viewed_by_admin: false,
    created_at: isoAt(-1, 20),
    updated_at: isoAt(-1, 20),
  },
  {
    id: ids.pendingAds.p2,
    advertiser_name: "Bella Bakery",
    contact_name: "Maria Santos",
    email: "maria@bellabakery.test",
    phone: "+1 555-0707",
    phone_number: "+1 555-0707",
    business_name: "Bella Bakery and Cafe",
    ad_name: "Wedding Cake Showcase",
    post_type: "custom_schedule",
    post_date: dateAt(10),
    post_date_from: dateAt(10),
    post_time: "11:00",
    custom_dates: [dateAt(10), dateAt(12), dateAt(14)],
    reminder_minutes: 15,
    ad_text: "Book your wedding tasting session.",
    media: [],
    placement: "Both",
    notes: "Weekend schedule.",
    status: "pending",
    viewed_by_admin: false,
    created_at: isoAt(0, 14),
    updated_at: isoAt(0, 14),
  },
];

const teamMembers = [
  {
    id: ids.teamMembers.m1,
    name: "Alex Johnson",
    email: "alex@cbnads.test",
    role: "Manager",
    created_at: isoAt(-30, 9),
    updated_at: isoAt(-1, 10),
  },
  {
    id: ids.teamMembers.m2,
    name: "Priya Patel",
    email: "priya@cbnads.test",
    role: "Staff",
    created_at: isoAt(-20, 9),
    updated_at: isoAt(-1, 10),
  },
];

const sentReminders = [
  {
    id: ids.reminders.r1,
    ad_id: ids.ads.a1,
    sent_at: isoAt(-1, 8),
    reminder_type: "scheduled",
    recipient_type: "admin",
  },
];

const failOnError = (label, result) => {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
};

const upsertRows = async (tableName, rows, onConflict = "id") => {
  if (!rows.length) return;
  const result = await supabase.from(tableName).upsert(rows, { onConflict });
  failOnError(`upsert ${tableName}`, result);
};

const ensureSingletonRow = async (tableName, row) => {
  const selectResult = await supabase
    .from(tableName)
    .select("id")
    .order("id", { ascending: true })
    .limit(1);
  failOnError(`select ${tableName}`, selectResult);

  const first = selectResult.data?.[0];
  if (!first) {
    const insertResult = await supabase.from(tableName).insert(row);
    failOnError(`insert ${tableName}`, insertResult);
    return;
  }

  const updateResult = await supabase.from(tableName).update(row).eq("id", first.id);
  failOnError(`update ${tableName}`, updateResult);
};

const countByIds = async (tableName, idList) => {
  const result = await supabase
    .from(tableName)
    .select("id", { head: true, count: "exact" })
    .in("id", idList);
  failOnError(`count ${tableName}`, result);
  return result.count ?? 0;
};

const run = async () => {
  console.log(`Seeding Supabase namespace: ${namespace}`);

  await ensureSingletonRow(table("admin_settings"), {
    max_ads_per_slot: 2,
    max_ads_per_day: 5,
    default_post_time: "09:00",
    updated_at: isoAt(0, 9),
  });

  await ensureSingletonRow(table("notification_preferences"), {
    email_enabled: true,
    reminder_email: "alerts@cbnads.test",
    updated_at: isoAt(0, 9),
  });

  await upsertRows(table("advertisers"), advertisers);
  await upsertRows(table("products"), products);
  await upsertRows(table("invoices"), invoices);
  await upsertRows(table("ads"), ads);
  await upsertRows(table("invoice_items"), invoiceItems);
  await upsertRows(table("pending_ads"), pendingAds);
  await upsertRows(table("team_members"), teamMembers);
  await upsertRows(table("sent_reminders"), sentReminders);

  const summary = {
    advertisers: await countByIds(table("advertisers"), Object.values(ids.advertisers)),
    products: await countByIds(table("products"), Object.values(ids.products)),
    ads: await countByIds(table("ads"), Object.values(ids.ads)),
    invoices: await countByIds(table("invoices"), Object.values(ids.invoices)),
    invoice_items: await countByIds(table("invoice_items"), Object.values(ids.invoiceItems)),
    pending_ads: await countByIds(table("pending_ads"), Object.values(ids.pendingAds)),
    team_members: await countByIds(table("team_members"), Object.values(ids.teamMembers)),
  };

  console.log("Seed complete.");
  console.log(JSON.stringify(summary, null, 2));
};

run().catch((error) => {
  console.error("Seed failed.");
  console.error(error?.message || error);
  process.exit(1);
});
