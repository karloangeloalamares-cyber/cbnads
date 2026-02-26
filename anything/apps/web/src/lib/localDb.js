const DB_KEY = 'cbnads.local.db.v1';
const SESSION_KEY = 'cbnads.local.session.v1';
const DB_VERSION = 1;

const nowIso = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

const storage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
};

const baseDb = () => {
  const now = nowIso();
  return {
    version: DB_VERSION,
    users: [
      {
        id: 'user_admin',
        name: 'Admin User',
        email: 'admin@cbnads.local',
        password: 'admin123',
        role: 'admin',
        image: '',
        created_at: now,
        updated_at: now,
      },
    ],
    advertisers: [],
    products: [],
    ads: [],
    pending_ads: [],
    invoices: [],
    admin_settings: {
      max_ads_per_slot: 2,
      default_post_time: '09:00',
    },
    notification_preferences: {
      email_enabled: false,
      reminder_email: '',
    },
    team_members: [],
  };
};

const normalizeDb = (rawValue) => {
  const seed = baseDb();
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};

  return {
    ...seed,
    ...raw,
    version: DB_VERSION,
    users: Array.isArray(raw.users) && raw.users.length > 0 ? raw.users : seed.users,
    advertisers: Array.isArray(raw.advertisers) ? raw.advertisers : [],
    products: Array.isArray(raw.products) ? raw.products : [],
    ads: Array.isArray(raw.ads) ? raw.ads : [],
    pending_ads: Array.isArray(raw.pending_ads) ? raw.pending_ads : [],
    invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
    admin_settings: {
      ...seed.admin_settings,
      ...(raw.admin_settings ?? {}),
    },
    notification_preferences: {
      ...seed.notification_preferences,
      ...(raw.notification_preferences ?? {}),
    },
    team_members: Array.isArray(raw.team_members) ? raw.team_members : [],
  };
};

const readRawDb = () => {
  const s = storage();
  if (!s) {
    return normalizeDb(baseDb());
  }

  const raw = s.getItem(DB_KEY);
  if (!raw) {
    return normalizeDb(baseDb());
  }

  try {
    return normalizeDb(JSON.parse(raw));
  } catch {
    return normalizeDb(baseDb());
  }
};

const refreshDerivedFields = (db) => {
  const today = new Date();
  const spendByAdvertiser = new Map();
  const nextDateByAdvertiser = new Map();

  for (const ad of db.ads) {
    const advertiserId = ad.advertiser_id;
    if (!advertiserId) {
      continue;
    }

    if (ad.payment === 'Paid') {
      const nextSpend = (spendByAdvertiser.get(advertiserId) ?? 0) + numberOrZero(ad.price);
      spendByAdvertiser.set(advertiserId, nextSpend);
    }

    if (ad.post_date) {
      const postDate = new Date(ad.post_date);
      if (!Number.isNaN(postDate.valueOf()) && postDate >= today) {
        const current = nextDateByAdvertiser.get(advertiserId);
        if (!current || postDate < current) {
          nextDateByAdvertiser.set(advertiserId, postDate);
        }
      }
    }
  }

  db.advertisers = db.advertisers.map((advertiser) => {
    const nextDate = nextDateByAdvertiser.get(advertiser.id);
    return {
      ...advertiser,
      ad_spend: Number(spendByAdvertiser.get(advertiser.id) ?? 0).toFixed(2),
      next_ad_date: nextDate ? nextDate.toISOString().slice(0, 10) : '',
    };
  });

  return db;
};

const writeRawDb = (value) => {
  const normalized = refreshDerivedFields(normalizeDb(value));
  const s = storage();
  if (s) {
    s.setItem(DB_KEY, JSON.stringify(normalized));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cbn:db-changed'));
    }
  }
  return clone(normalized);
};

export const ensureDb = () => {
  const s = storage();
  const current = readRawDb();
  if (!s) {
    return clone(current);
  }

  if (!s.getItem(DB_KEY)) {
    writeRawDb(current);
  }
  return clone(readRawDb());
};

export const readDb = () => clone(readRawDb());

export const writeDb = (value) => writeRawDb(value);

export const updateDb = (updater) => {
  const current = readDb();
  const draft = clone(current);
  const maybeNext = updater(draft);
  return writeDb(maybeNext ?? draft);
};

export const subscribeDb = (listener) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event) => {
    if (event.key === DB_KEY || event.key === SESSION_KEY) {
      listener();
    }
  };
  const onCustom = () => listener();

  window.addEventListener('storage', onStorage);
  window.addEventListener('cbn:db-changed', onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('cbn:db-changed', onCustom);
  };
};

export const getSessionUserId = () => {
  const s = storage();
  if (!s) {
    return null;
  }
  return s.getItem(SESSION_KEY);
};

export const setSessionUserId = (userId) => {
  const s = storage();
  if (!s) {
    return;
  }
  if (userId) {
    s.setItem(SESSION_KEY, userId);
  } else {
    s.removeItem(SESSION_KEY);
  }
  window.dispatchEvent(new CustomEvent('cbn:db-changed'));
};

export const clearSession = () => setSessionUserId(null);

export const upsertAdvertiser = (input) => {
  let saved = null;
  updateDb((db) => {
    const now = nowIso();
    const payload = {
      id: input.id || createId('adv'),
      advertiser_name: (input.advertiser_name || '').trim(),
      email: (input.email || '').trim(),
      phone: (input.phone || '').trim(),
      business_name: (input.business_name || '').trim(),
      ad_spend: '0.00',
      next_ad_date: '',
      created_at: input.created_at || now,
      updated_at: now,
    };

    const index = db.advertisers.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      db.advertisers.unshift(payload);
    } else {
      payload.created_at = db.advertisers[index].created_at ?? payload.created_at;
      db.advertisers[index] = { ...db.advertisers[index], ...payload };
    }
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteAdvertiser = (advertiserId) => {
  updateDb((db) => {
    db.advertisers = db.advertisers.filter((item) => item.id !== advertiserId);
    db.ads = db.ads.map((ad) =>
      ad.advertiser_id === advertiserId
        ? { ...ad, advertiser_id: '', advertiser: ad.advertiser || 'Unknown advertiser' }
        : ad
    );
    return db;
  });
};

export const upsertProduct = (input) => {
  let saved = null;
  updateDb((db) => {
    const now = nowIso();
    const payload = {
      id: input.id || createId('prd'),
      product_name: (input.product_name || '').trim(),
      price: numberOrZero(input.price).toFixed(2),
      description: (input.description || '').trim(),
      created_at: input.created_at || now,
      updated_at: now,
    };

    const index = db.products.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      db.products.unshift(payload);
    } else {
      payload.created_at = db.products[index].created_at ?? payload.created_at;
      db.products[index] = { ...db.products[index], ...payload };
    }
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteProduct = (productId) => {
  updateDb((db) => {
    db.products = db.products.filter((item) => item.id !== productId);
    db.ads = db.ads.map((ad) =>
      ad.product_id === productId ? { ...ad, product_id: '', product_name: ad.product_name || '' } : ad
    );
    return db;
  });
};

export const upsertAd = (input) => {
  let saved = null;
  updateDb((db) => {
    const now = nowIso();
    const advertiser = db.advertisers.find((item) => item.id === input.advertiser_id);
    const product = db.products.find((item) => item.id === input.product_id);
    const payload = {
      id: input.id || createId('ad'),
      ad_name: (input.ad_name || '').trim(),
      advertiser_id: input.advertiser_id || '',
      advertiser: advertiser?.advertiser_name || input.advertiser || '',
      product_id: input.product_id || '',
      product_name: product?.product_name || input.product_name || '',
      post_type: input.post_type || 'one_time',
      status: input.status || 'Draft',
      payment: input.payment || 'Unpaid',
      post_date: input.post_date || '',
      post_time: input.post_time || '',
      notes: input.notes || '',
      price: numberOrZero(input.price).toFixed(2),
      media_urls: Array.isArray(input.media_urls) ? input.media_urls : [],
      invoice_id: input.invoice_id || null,
      created_at: input.created_at || now,
      updated_at: now,
    };

    const index = db.ads.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      db.ads.unshift(payload);
    } else {
      payload.created_at = db.ads[index].created_at ?? payload.created_at;
      payload.invoice_id = db.ads[index].invoice_id ?? payload.invoice_id;
      db.ads[index] = { ...db.ads[index], ...payload };
    }
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteAd = (adId) => {
  updateDb((db) => {
    db.ads = db.ads.filter((item) => item.id !== adId);
    db.invoices = db.invoices.map((invoice) => ({
      ...invoice,
      ad_ids: (invoice.ad_ids || []).filter((id) => id !== adId),
    }));
    return db;
  });
};

export const updateAdStatus = (adId, status) => {
  updateDb((db) => {
    db.ads = db.ads.map((ad) => (ad.id === adId ? { ...ad, status, updated_at: nowIso() } : ad));
    return db;
  });
};

export const updateAdPayment = (adId, payment) => {
  updateDb((db) => {
    db.ads = db.ads.map((ad) => (ad.id === adId ? { ...ad, payment, updated_at: nowIso() } : ad));
    return db;
  });
};

export const submitPendingAd = (input) => {
  let saved = null;
  updateDb((db) => {
    const postDateFrom = input.post_date_from || input.post_date || '';
    const postDateTo = input.post_date_to || '';
    const customDates = Array.isArray(input.custom_dates) ? input.custom_dates.filter(Boolean) : [];
    const phone = (input.phone || input.phone_number || '').trim();
    const payload = {
      id: createId('pending'),
      advertiser_name: (input.advertiser_name || '').trim(),
      contact_name: (input.contact_name || '').trim(),
      email: (input.email || '').trim(),
      phone,
      phone_number: phone,
      business_name: (input.business_name || '').trim(),
      ad_name: (input.ad_name || '').trim(),
      post_type: input.post_type || 'one_time',
      post_date: input.post_date || postDateFrom || customDates[0] || '',
      post_date_from: postDateFrom,
      post_date_to: postDateTo,
      custom_dates: customDates,
      post_time: input.post_time || '',
      reminder_minutes: Number(input.reminder_minutes) || 15,
      ad_text: input.ad_text || '',
      media: Array.isArray(input.media) ? input.media : [],
      placement: input.placement || '',
      notes: input.notes || '',
      status: 'pending',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.pending_ads.unshift(payload);
    saved = payload;
    return db;
  });
  return saved;
};

export const approvePendingAd = (pendingAdId) => {
  updateDb((db) => {
    const pending = db.pending_ads.find((item) => item.id === pendingAdId);
    if (!pending || pending.status !== 'pending') {
      return db;
    }

    const postDate =
      pending.post_date ||
      pending.post_date_from ||
      (Array.isArray(pending.custom_dates) ? pending.custom_dates[0] : '') ||
      '';

    let advertiser =
      db.advertisers.find(
        (item) => item.email && pending.email && item.email.toLowerCase() === pending.email.toLowerCase()
      ) || null;

    if (!advertiser) {
      advertiser = {
        id: createId('adv'),
        advertiser_name: pending.advertiser_name || pending.email || 'New advertiser',
        email: pending.email || '',
        phone: pending.phone || pending.phone_number || '',
        business_name: pending.business_name || '',
        ad_spend: '0.00',
        next_ad_date: postDate,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.advertisers.unshift(advertiser);
    }

    db.ads.unshift({
      id: createId('ad'),
      ad_name: pending.ad_name || 'Submitted ad',
      advertiser_id: advertiser.id,
      advertiser: advertiser.advertiser_name,
      product_id: '',
      product_name: '',
      post_type: pending.post_type || 'one_time',
      status: 'Draft',
      payment: 'Unpaid',
      post_date: postDate,
      post_date_from: pending.post_date_from || postDate,
      post_date_to: pending.post_date_to || '',
      custom_dates: Array.isArray(pending.custom_dates) ? pending.custom_dates : [],
      post_time: pending.post_time || '',
      ad_text: pending.ad_text || '',
      media: Array.isArray(pending.media) ? pending.media : [],
      placement: pending.placement || '',
      reminder_minutes: Number(pending.reminder_minutes) || 15,
      notes: pending.notes || '',
      price: '0.00',
      media_urls: [],
      invoice_id: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });

    pending.status = 'approved';
    pending.updated_at = nowIso();
    return db;
  });
};

export const rejectPendingAd = (pendingAdId) => {
  updateDb((db) => {
    db.pending_ads = db.pending_ads.map((item) =>
      item.id === pendingAdId ? { ...item, status: 'not_approved', updated_at: nowIso() } : item
    );
    return db;
  });
};

export const deletePendingAd = (pendingAdId) => {
  updateDb((db) => {
    db.pending_ads = db.pending_ads.filter((item) => item.id !== pendingAdId);
    return db;
  });
};

const applyInvoiceLinks = (db, invoiceId, previousAdIds, nextAdIds, invoiceStatus) => {
  const previous = new Set(previousAdIds);
  const next = new Set(nextAdIds);

  db.ads = db.ads.map((ad) => {
    if (next.has(ad.id)) {
      return {
        ...ad,
        invoice_id: invoiceId,
        payment: invoiceStatus === 'Paid' ? 'Paid' : ad.payment,
        updated_at: nowIso(),
      };
    }

    if (previous.has(ad.id) && ad.invoice_id === invoiceId) {
      return {
        ...ad,
        invoice_id: null,
        payment: ad.payment === 'Paid' ? 'Unpaid' : ad.payment,
        updated_at: nowIso(),
      };
    }

    return ad;
  });
};

export const upsertInvoice = (input) => {
  let saved = null;
  updateDb((db) => {
    const now = nowIso();
    const invoiceId = input.id || createId('inv');
    const adIds = Array.isArray(input.ad_ids) ? input.ad_ids.filter(Boolean) : [];
    const advertiser = db.advertisers.find((item) => item.id === input.advertiser_id);
    const existing = db.invoices.find((item) => item.id === invoiceId);
    const previousAdIds = existing?.ad_ids || [];

    const payload = {
      id: invoiceId,
      invoice_number: (input.invoice_number || '').trim() || `INV-${Date.now().toString().slice(-6)}`,
      advertiser_id: input.advertiser_id || '',
      advertiser_name: advertiser?.advertiser_name || input.advertiser_name || '',
      amount: numberOrZero(input.amount).toFixed(2),
      due_date: input.due_date || '',
      status: input.status || 'Unpaid',
      paid_date: input.status === 'Paid' ? input.paid_date || now.slice(0, 10) : '',
      ad_ids: adIds,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    const index = db.invoices.findIndex((item) => item.id === invoiceId);
    if (index === -1) {
      db.invoices.unshift(payload);
    } else {
      db.invoices[index] = { ...db.invoices[index], ...payload };
    }

    applyInvoiceLinks(db, invoiceId, previousAdIds, adIds, payload.status);
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteInvoice = (invoiceId) => {
  updateDb((db) => {
    const invoice = db.invoices.find((item) => item.id === invoiceId);
    const linkedAdIds = invoice?.ad_ids || [];
    db.invoices = db.invoices.filter((item) => item.id !== invoiceId);
    applyInvoiceLinks(db, invoiceId, linkedAdIds, [], 'Unpaid');
    return db;
  });
};

export const upsertTeamMember = (input) => {
  let saved = null;
  updateDb((db) => {
    const now = nowIso();
    const payload = {
      id: input.id || createId('member'),
      name: (input.name || '').trim(),
      email: (input.email || '').trim(),
      role: input.role || 'member',
      created_at: input.created_at || now,
      updated_at: now,
    };
    const index = db.team_members.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      db.team_members.unshift(payload);
    } else {
      payload.created_at = db.team_members[index].created_at ?? payload.created_at;
      db.team_members[index] = { ...db.team_members[index], ...payload };
    }
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteTeamMember = (memberId) => {
  updateDb((db) => {
    db.team_members = db.team_members.filter((member) => member.id !== memberId);
    return db;
  });
};

export const saveAdminSettings = (settings) => {
  updateDb((db) => {
    db.admin_settings = {
      ...db.admin_settings,
      ...settings,
    };
    return db;
  });
};

export const saveNotificationPreferences = (preferences) => {
  updateDb((db) => {
    db.notification_preferences = {
      ...db.notification_preferences,
      ...preferences,
    };
    return db;
  });
};

export const resetDb = () => {
  writeDb(baseDb());
  clearSession();
};

export const exportDbJson = () => JSON.stringify(readDb(), null, 2);

export const exportAdsCsv = () => {
  const db = readDb();
  const headers = [
    'id',
    'ad_name',
    'advertiser',
    'product_name',
    'post_type',
    'status',
    'payment',
    'post_date',
    'post_time',
    'price',
  ];

  const rows = db.ads.map((ad) =>
    [
      ad.id,
      ad.ad_name,
      ad.advertiser,
      ad.product_name,
      ad.post_type,
      ad.status,
      ad.payment,
      ad.post_date,
      ad.post_time,
      ad.price,
    ]
      .map((field) => `"${String(field ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
};

export const getReconciliationReport = () => {
  const db = readDb();

  const discrepancies = db.invoices
    .map((invoice) => {
      const invoiceAdTotal = (invoice.ad_ids || []).reduce((total, adId) => {
        const ad = db.ads.find((item) => item.id === adId);
        return total + numberOrZero(ad?.price);
      }, 0);
      const invoiceTotal = numberOrZero(invoice.amount);
      const difference = invoiceTotal - invoiceAdTotal;
      if (Math.abs(difference) < 0.001) {
        return null;
      }

      return {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        advertiser_name: invoice.advertiser_name,
        invoice_total: invoiceTotal.toFixed(2),
        ads_total: invoiceAdTotal.toFixed(2),
        difference: difference.toFixed(2),
        ad_count: (invoice.ad_ids || []).length,
      };
    })
    .filter(Boolean);

  const orphanedPaidAds = db.ads
    .filter((ad) => ad.payment === 'Paid' && !ad.invoice_id)
    .map((ad) => ({
      id: ad.id,
      ad_name: ad.ad_name,
      advertiser: ad.advertiser,
      status: ad.status,
      payment: ad.payment,
    }));

  const deletedInvoiceAds = db.ads
    .filter((ad) => ad.invoice_id && !db.invoices.find((invoice) => invoice.id === ad.invoice_id))
    .map((ad) => ({
      id: ad.id,
      ad_name: ad.ad_name,
      advertiser: ad.advertiser,
      payment: ad.payment,
      invoice_number: ad.invoice_id,
    }));

  return {
    summary: {
      totalDiscrepancies: discrepancies.length,
      totalOrphanedAds: orphanedPaidAds.length,
      totalDeletedInvoiceAds: deletedInvoiceAds.length,
    },
    discrepancies,
    orphanedPaidAds,
    deletedInvoiceAds,
  };
};
