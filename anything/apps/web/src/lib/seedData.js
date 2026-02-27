/**
 * Seed data loader for local development.
 *
 * Usage — from the browser console:
 *   import('/src/lib/seedData.js').then(m => m.seed())
 *
 * Or call `seedLocalDb()` from any component / dev-tools script.
 * Calling `seed()` is idempotent: it checks for an existing marker before writing.
 */

import { ensureDb, readDb, writeDb } from '@/lib/localDb';

// ── helpers ──────────────────────────────────────────────────────────────────

const today = new Date();
const isoNow = () => new Date().toISOString();
const daysFromNow = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (n) => daysFromNow(-n);

// ── seed IDs (stable so re-runs are safe) ────────────────────────────────────

const ADV_IDS = {
  greenLeaf: 'adv_seed_greenleaf',
  urbanBites: 'adv_seed_urbanbites',
  techNova: 'adv_seed_technova',
  brightSmile: 'adv_seed_brightsmile',
  coastalRealty: 'adv_seed_coastalrealty',
};

const PRD_IDS = {
  whatsappStandard: 'prd_seed_wa_standard',
  whatsappPremium: 'prd_seed_wa_premium',
  websiteBanner: 'prd_seed_web_banner',
  comboPack: 'prd_seed_combo',
};

const AD_IDS = {
  greenLeaf1: 'ad_seed_gl1',
  greenLeaf2: 'ad_seed_gl2',
  urbanBites1: 'ad_seed_ub1',
  urbanBites2: 'ad_seed_ub2',
  techNova1: 'ad_seed_tn1',
  techNova2: 'ad_seed_tn2',
  brightSmile1: 'ad_seed_bs1',
  coastalRealty1: 'ad_seed_cr1',
  coastalRealty2: 'ad_seed_cr2',
  coastalRealty3: 'ad_seed_cr3',
};

const INV_IDS = {
  inv1: 'inv_seed_001',
  inv2: 'inv_seed_002',
  inv3: 'inv_seed_003',
  inv4: 'inv_seed_004',
};

// ── advertisers ──────────────────────────────────────────────────────────────

const advertisers = [
  {
    id: ADV_IDS.greenLeaf,
    advertiser_name: 'GreenLeaf Organics',
    contact_name: 'Sarah Mitchell',
    email: 'sarah@greenleaforganics.com',
    phone: '+1 555-0101',
    phone_number: '+1 555-0101',
    business_name: 'GreenLeaf Organics LLC',
    status: 'active',
    ad_spend: '0.00',
    total_spend: '0.00',
    next_ad_date: '',
    created_at: daysAgo(90) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: ADV_IDS.urbanBites,
    advertiser_name: 'Urban Bites',
    contact_name: 'Marcus Chen',
    email: 'marcus@urbanbites.co',
    phone: '+1 555-0202',
    phone_number: '+1 555-0202',
    business_name: 'Urban Bites Restaurant Group',
    status: 'active',
    ad_spend: '0.00',
    total_spend: '0.00',
    next_ad_date: '',
    created_at: daysAgo(60) + 'T14:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: ADV_IDS.techNova,
    advertiser_name: 'TechNova Solutions',
    contact_name: 'Jessica Park',
    email: 'jessica@technova.io',
    phone: '+1 555-0303',
    phone_number: '+1 555-0303',
    business_name: 'TechNova Solutions Inc.',
    status: 'active',
    ad_spend: '0.00',
    total_spend: '0.00',
    next_ad_date: '',
    created_at: daysAgo(45) + 'T09:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: ADV_IDS.brightSmile,
    advertiser_name: 'BrightSmile Dental',
    contact_name: 'Dr. Robert Kim',
    email: 'admin@brightsmile.dental',
    phone: '+1 555-0404',
    phone_number: '+1 555-0404',
    business_name: 'BrightSmile Dental Care',
    status: 'paused',
    ad_spend: '0.00',
    total_spend: '0.00',
    next_ad_date: '',
    created_at: daysAgo(120) + 'T11:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: ADV_IDS.coastalRealty,
    advertiser_name: 'Coastal Realty',
    contact_name: 'Amanda Torres',
    email: 'amanda@coastalrealty.com',
    phone: '+1 555-0505',
    phone_number: '+1 555-0505',
    business_name: 'Coastal Realty Partners',
    status: 'active',
    ad_spend: '0.00',
    total_spend: '0.00',
    next_ad_date: '',
    created_at: daysAgo(30) + 'T08:00:00.000Z',
    updated_at: isoNow(),
  },
];

// ── products ─────────────────────────────────────────────────────────────────

const products = [
  {
    id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    placement: 'WhatsApp',
    price: '25.00',
    description: 'Single WhatsApp status ad post with text and one image.',
    created_at: daysAgo(100) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: PRD_IDS.whatsappPremium,
    product_name: 'WhatsApp Ad - Premium',
    placement: 'WhatsApp',
    price: '75.00',
    description: 'Daily WhatsApp status ad for 7 consecutive days with media carousel.',
    created_at: daysAgo(100) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: PRD_IDS.websiteBanner,
    product_name: 'Website Banner Ad',
    placement: 'Website',
    price: '150.00',
    description: 'Banner ad displayed on the website for 30 days. Standard 728x90 size.',
    created_at: daysAgo(100) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: PRD_IDS.comboPack,
    product_name: 'Combo Pack - WhatsApp + Website',
    placement: 'Both',
    price: '200.00',
    description: 'Bundle: 5-day WhatsApp run plus 30-day website banner placement.',
    created_at: daysAgo(80) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
];

// ── ads ──────────────────────────────────────────────────────────────────────

const ads = [
  // GreenLeaf — active daily run (WhatsApp)
  {
    id: AD_IDS.greenLeaf1,
    ad_name: 'Spring Organic Sale',
    advertiser_id: ADV_IDS.greenLeaf,
    advertiser: 'GreenLeaf Organics',
    product_id: PRD_IDS.whatsappPremium,
    product_name: 'WhatsApp Ad - Premium',
    post_type: 'daily',
    status: 'Posted',
    payment: 'Paid',
    post_date: daysAgo(3),
    post_date_from: daysAgo(3),
    post_date_to: daysFromNow(4),
    custom_dates: [],
    post_time: '09:00',
    schedule: daysAgo(3),
    placement: 'WhatsApp',
    ad_text: 'Fresh organic produce delivered to your door! Use code SPRING25 for 25% off your first order.',
    notes: 'Client wants morning posting for best engagement.',
    price: '75.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: true,
    reminder_minutes_before: 60,
    banner_size: '',
    published_dates: [daysAgo(3), daysAgo(2), daysAgo(1), daysFromNow(0)],
    archived: false,
    created_at: daysAgo(5) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  // GreenLeaf — scheduled future ad
  {
    id: AD_IDS.greenLeaf2,
    ad_name: 'Summer Harvest Preview',
    advertiser_id: ADV_IDS.greenLeaf,
    advertiser: 'GreenLeaf Organics',
    product_id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    post_type: 'one_time',
    status: 'Scheduled',
    payment: 'Paid',
    post_date: daysFromNow(14),
    post_date_from: daysFromNow(14),
    post_date_to: '',
    custom_dates: [],
    post_time: '10:00',
    schedule: daysFromNow(14),
    placement: 'WhatsApp',
    ad_text: 'Summer is coming! Pre-order your seasonal box and save.',
    notes: '',
    price: '25.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: true,
    reminder_minutes_before: 30,
    banner_size: '',
    published_dates: [],
    archived: false,
    created_at: daysAgo(2) + 'T14:00:00.000Z',
    updated_at: isoNow(),
  },
  // Urban Bites — one-time posted ad
  {
    id: AD_IDS.urbanBites1,
    ad_name: 'Weekend Brunch Special',
    advertiser_id: ADV_IDS.urbanBites,
    advertiser: 'Urban Bites',
    product_id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    post_type: 'one_time',
    status: 'Completed',
    payment: 'Paid',
    post_date: daysAgo(7),
    post_date_from: daysAgo(7),
    post_date_to: '',
    custom_dates: [],
    post_time: '08:00',
    schedule: daysAgo(7),
    placement: 'WhatsApp',
    ad_text: 'This Saturday only — all-you-can-eat brunch for $19.99! Bring the family.',
    notes: 'Completed successfully. Client was happy with engagement.',
    price: '25.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: false,
    reminder_minutes_before: 60,
    banner_size: '',
    published_dates: [daysAgo(7)],
    archived: false,
    created_at: daysAgo(10) + 'T09:00:00.000Z',
    updated_at: daysAgo(7) + 'T08:30:00.000Z',
  },
  // Urban Bites — website banner (active)
  {
    id: AD_IDS.urbanBites2,
    ad_name: 'Urban Bites - New Menu Launch',
    advertiser_id: ADV_IDS.urbanBites,
    advertiser: 'Urban Bites',
    product_id: PRD_IDS.websiteBanner,
    product_name: 'Website Banner Ad',
    post_type: 'daily',
    status: 'Posted',
    payment: 'Paid',
    post_date: daysAgo(10),
    post_date_from: daysAgo(10),
    post_date_to: daysFromNow(20),
    custom_dates: [],
    post_time: '',
    schedule: daysAgo(10),
    placement: 'Website',
    ad_text: 'Introducing our all-new spring menu — reserve your table today!',
    notes: 'Banner runs for 30 days on homepage.',
    price: '150.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: false,
    reminder_minutes_before: 60,
    banner_size: '728x90',
    published_dates: [],
    archived: false,
    created_at: daysAgo(12) + 'T11:00:00.000Z',
    updated_at: isoNow(),
  },
  // TechNova — custom dates ad (Approved, not yet posted)
  {
    id: AD_IDS.techNova1,
    ad_name: 'TechNova Product Launch',
    advertiser_id: ADV_IDS.techNova,
    advertiser: 'TechNova Solutions',
    product_id: PRD_IDS.comboPack,
    product_name: 'Combo Pack - WhatsApp + Website',
    post_type: 'custom',
    status: 'Approved',
    payment: 'Paid',
    post_date: daysFromNow(3),
    post_date_from: daysFromNow(3),
    post_date_to: '',
    custom_dates: [daysFromNow(3), daysFromNow(5), daysFromNow(7), daysFromNow(10)],
    post_time: '11:00',
    schedule: daysFromNow(3),
    placement: 'Both',
    ad_text: 'Revolutionize your workflow with TechNova AI Suite — launching this month. Early adopters get 40% off.',
    notes: 'High-priority client. Custom dates around their launch event.',
    price: '200.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: true,
    reminder_minutes_before: 120,
    banner_size: '728x90',
    published_dates: [],
    archived: false,
    created_at: daysAgo(4) + 'T16:00:00.000Z',
    updated_at: isoNow(),
  },
  // TechNova — draft ad
  {
    id: AD_IDS.techNova2,
    ad_name: 'TechNova Webinar Promo',
    advertiser_id: ADV_IDS.techNova,
    advertiser: 'TechNova Solutions',
    product_id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    post_type: 'one_time',
    status: 'Draft',
    payment: 'Unpaid',
    post_date: daysFromNow(21),
    post_date_from: daysFromNow(21),
    post_date_to: '',
    custom_dates: [],
    post_time: '14:00',
    schedule: daysFromNow(21),
    placement: 'WhatsApp',
    ad_text: 'Join our free webinar on AI-powered productivity. Register now!',
    notes: 'Awaiting final copy from client.',
    price: '25.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: false,
    reminder_minutes_before: 60,
    banner_size: '',
    published_dates: [],
    archived: false,
    created_at: daysAgo(1) + 'T10:00:00.000Z',
    updated_at: isoNow(),
  },
  // BrightSmile — cancelled ad
  {
    id: AD_IDS.brightSmile1,
    ad_name: 'Teeth Whitening Special',
    advertiser_id: ADV_IDS.brightSmile,
    advertiser: 'BrightSmile Dental',
    product_id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    post_type: 'one_time',
    status: 'Cancelled',
    payment: 'Unpaid',
    post_date: daysAgo(14),
    post_date_from: daysAgo(14),
    post_date_to: '',
    custom_dates: [],
    post_time: '09:00',
    schedule: daysAgo(14),
    placement: 'WhatsApp',
    ad_text: 'Professional teeth whitening — 50% off this month only.',
    notes: 'Cancelled by client. Account paused.',
    price: '25.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: false,
    reminder_minutes_before: 60,
    banner_size: '',
    published_dates: [],
    archived: true,
    created_at: daysAgo(20) + 'T15:00:00.000Z',
    updated_at: daysAgo(14) + 'T09:00:00.000Z',
  },
  // Coastal Realty — posted one-time ad
  {
    id: AD_IDS.coastalRealty1,
    ad_name: 'Beachfront Open House',
    advertiser_id: ADV_IDS.coastalRealty,
    advertiser: 'Coastal Realty',
    product_id: PRD_IDS.whatsappStandard,
    product_name: 'WhatsApp Ad - Standard',
    post_type: 'one_time',
    status: 'Posted',
    payment: 'Paid',
    post_date: daysFromNow(0),
    post_date_from: daysFromNow(0),
    post_date_to: '',
    custom_dates: [],
    post_time: '10:00',
    schedule: daysFromNow(0),
    placement: 'WhatsApp',
    ad_text: 'Open house TODAY at 123 Ocean Drive! 4 bed, 3 bath with stunning views. Come see it before it sells.',
    notes: '',
    price: '25.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: true,
    reminder_minutes_before: 60,
    banner_size: '',
    published_dates: [daysFromNow(0)],
    archived: false,
    created_at: daysAgo(3) + 'T08:00:00.000Z',
    updated_at: isoNow(),
  },
  // Coastal Realty — website banner ending soon
  {
    id: AD_IDS.coastalRealty2,
    ad_name: 'Coastal Realty - Spring Listings',
    advertiser_id: ADV_IDS.coastalRealty,
    advertiser: 'Coastal Realty',
    product_id: PRD_IDS.websiteBanner,
    product_name: 'Website Banner Ad',
    post_type: 'daily',
    status: 'Posted',
    payment: 'Paid',
    post_date: daysAgo(28),
    post_date_from: daysAgo(28),
    post_date_to: daysFromNow(2),
    custom_dates: [],
    post_time: '',
    schedule: daysAgo(28),
    placement: 'Website',
    ad_text: 'Find your dream home with Coastal Realty. Browse our latest spring listings.',
    notes: 'Ending soon — follow up with client about renewal.',
    price: '150.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: false,
    reminder_minutes_before: 60,
    banner_size: '728x90',
    published_dates: [],
    archived: false,
    created_at: daysAgo(30) + 'T09:00:00.000Z',
    updated_at: isoNow(),
  },
  // Coastal Realty — scheduled future ad
  {
    id: AD_IDS.coastalRealty3,
    ad_name: 'Luxury Condo Preview',
    advertiser_id: ADV_IDS.coastalRealty,
    advertiser: 'Coastal Realty',
    product_id: PRD_IDS.comboPack,
    product_name: 'Combo Pack - WhatsApp + Website',
    post_type: 'daily',
    status: 'Scheduled',
    payment: 'Unpaid',
    post_date: daysFromNow(7),
    post_date_from: daysFromNow(7),
    post_date_to: daysFromNow(12),
    custom_dates: [],
    post_time: '09:00',
    schedule: daysFromNow(7),
    placement: 'Both',
    ad_text: 'Exclusive preview: luxury oceanfront condos starting at $450K. Schedule a private showing.',
    notes: 'Pending payment — invoice sent.',
    price: '200.00',
    media_urls: [],
    invoice_id: null,
    reminder_enabled: true,
    reminder_minutes_before: 60,
    banner_size: '728x90',
    published_dates: [],
    archived: false,
    created_at: daysAgo(1) + 'T16:00:00.000Z',
    updated_at: isoNow(),
  },
];

// ── invoices ─────────────────────────────────────────────────────────────────

const invoices = [
  {
    id: INV_IDS.inv1,
    invoice_number: 'INV-100001',
    advertiser_id: ADV_IDS.greenLeaf,
    advertiser_name: 'GreenLeaf Organics',
    amount: '100.00',
    due_date: daysAgo(5),
    status: 'Paid',
    paid_date: daysAgo(6),
    ad_ids: [AD_IDS.greenLeaf1, AD_IDS.greenLeaf2],
    created_at: daysAgo(15) + 'T10:00:00.000Z',
    updated_at: daysAgo(6) + 'T10:00:00.000Z',
  },
  {
    id: INV_IDS.inv2,
    invoice_number: 'INV-100002',
    advertiser_id: ADV_IDS.urbanBites,
    advertiser_name: 'Urban Bites',
    amount: '175.00',
    due_date: daysAgo(2),
    status: 'Paid',
    paid_date: daysAgo(3),
    ad_ids: [AD_IDS.urbanBites1, AD_IDS.urbanBites2],
    created_at: daysAgo(14) + 'T11:00:00.000Z',
    updated_at: daysAgo(3) + 'T09:00:00.000Z',
  },
  {
    id: INV_IDS.inv3,
    invoice_number: 'INV-100003',
    advertiser_id: ADV_IDS.techNova,
    advertiser_name: 'TechNova Solutions',
    amount: '200.00',
    due_date: daysFromNow(7),
    status: 'Unpaid',
    paid_date: '',
    ad_ids: [AD_IDS.techNova1],
    created_at: daysAgo(3) + 'T16:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: INV_IDS.inv4,
    invoice_number: 'INV-100004',
    advertiser_id: ADV_IDS.coastalRealty,
    advertiser_name: 'Coastal Realty',
    amount: '375.00',
    due_date: daysFromNow(10),
    status: 'Unpaid',
    paid_date: '',
    ad_ids: [AD_IDS.coastalRealty1, AD_IDS.coastalRealty2, AD_IDS.coastalRealty3],
    created_at: daysAgo(1) + 'T17:00:00.000Z',
    updated_at: isoNow(),
  },
];

// ── pending ads (public submissions awaiting review) ─────────────────────────

const pending_ads = [
  {
    id: 'pending_seed_001',
    advertiser_name: 'FitZone Gym',
    contact_name: 'Carlos Ramirez',
    email: 'carlos@fitzonegym.com',
    phone: '+1 555-0606',
    phone_number: '+1 555-0606',
    business_name: 'FitZone Fitness Center',
    ad_name: 'Summer Membership Drive',
    post_type: 'one_time',
    post_date: daysFromNow(5),
    post_date_from: daysFromNow(5),
    post_date_to: '',
    custom_dates: [],
    post_time: '07:00',
    reminder_minutes: 30,
    ad_text: 'Join FitZone this summer! First month FREE when you sign up for an annual membership.',
    media: [],
    placement: 'WhatsApp',
    notes: 'Would like morning posting time.',
    status: 'pending',
    created_at: daysAgo(1) + 'T20:00:00.000Z',
    updated_at: daysAgo(1) + 'T20:00:00.000Z',
  },
  {
    id: 'pending_seed_002',
    advertiser_name: 'Bella Bakery',
    contact_name: 'Maria Santos',
    email: 'maria@bellabakery.com',
    phone: '+1 555-0707',
    phone_number: '+1 555-0707',
    business_name: 'Bella Bakery & Cafe',
    ad_name: 'Wedding Cake Showcase',
    post_type: 'custom',
    post_date: daysFromNow(10),
    post_date_from: daysFromNow(10),
    post_date_to: '',
    custom_dates: [daysFromNow(10), daysFromNow(12), daysFromNow(14)],
    post_time: '11:00',
    reminder_minutes: 15,
    ad_text: 'Planning your dream wedding? Let Bella Bakery create the perfect cake. Book a free tasting today!',
    media: [],
    placement: 'Both',
    notes: 'Wants to run on weekends only.',
    status: 'pending',
    created_at: daysAgo(0) + 'T14:00:00.000Z',
    updated_at: daysAgo(0) + 'T14:00:00.000Z',
  },
];

// ── team members ─────────────────────────────────────────────────────────────

const team_members = [
  {
    id: 'member_seed_001',
    name: 'Alex Johnson',
    email: 'alex@cbnads.com',
    role: 'manager',
    created_at: daysAgo(60) + 'T09:00:00.000Z',
    updated_at: isoNow(),
  },
  {
    id: 'member_seed_002',
    name: 'Priya Patel',
    email: 'priya@cbnads.com',
    role: 'member',
    created_at: daysAgo(30) + 'T09:00:00.000Z',
    updated_at: isoNow(),
  },
];

// ── main seed function ───────────────────────────────────────────────────────

const SEED_MARKER = '__seeded_v1__';

export async function seed() {
  await ensureDb();
  const db = readDb();

  // Prevent double-seeding
  if (db[SEED_MARKER]) {
    console.log('[seed] Database already seeded. Call unseed() first to re-seed.');
    return db;
  }

  // Merge without overwriting existing data — append seed records
  const mergeById = (existing, incoming) => {
    const ids = new Set(existing.map((item) => item.id));
    const merged = [...existing];
    for (const item of incoming) {
      if (!ids.has(item.id)) {
        merged.push(item);
      }
    }
    return merged;
  };

  db.advertisers = mergeById(db.advertisers, advertisers);
  db.products = mergeById(db.products, products);
  db.ads = mergeById(db.ads, ads);
  db.invoices = mergeById(db.invoices, invoices);
  db.pending_ads = mergeById(db.pending_ads, pending_ads);
  db.team_members = mergeById(db.team_members, team_members);

  // Link invoices to ads
  for (const inv of invoices) {
    for (const adId of inv.ad_ids) {
      const ad = db.ads.find((a) => a.id === adId);
      if (ad) {
        ad.invoice_id = inv.id;
        if (inv.status === 'Paid') {
          ad.payment = 'Paid';
        }
      }
    }
  }

  db[SEED_MARKER] = true;

  const result = await writeDb(db);
  console.log(
    `[seed] Seeded: ${advertisers.length} advertisers, ${products.length} products, ${ads.length} ads, ${invoices.length} invoices, ${pending_ads.length} pending ads, ${team_members.length} team members.`
  );
  return result;
}

export async function unseed() {
  await ensureDb();
  const db = readDb();

  const seedIds = new Set([
    ...Object.values(ADV_IDS),
    ...Object.values(PRD_IDS),
    ...Object.values(AD_IDS),
    ...Object.values(INV_IDS),
    'pending_seed_001',
    'pending_seed_002',
    'member_seed_001',
    'member_seed_002',
  ]);

  db.advertisers = db.advertisers.filter((item) => !seedIds.has(item.id));
  db.products = db.products.filter((item) => !seedIds.has(item.id));
  db.ads = db.ads.filter((item) => !seedIds.has(item.id));
  db.invoices = db.invoices.filter((item) => !seedIds.has(item.id));
  db.pending_ads = db.pending_ads.filter((item) => !seedIds.has(item.id));
  db.team_members = db.team_members.filter((item) => !seedIds.has(item.id));
  delete db[SEED_MARKER];

  const result = await writeDb(db);
  console.log('[seed] Seed data removed.');
  return result;
}

export default seed;
