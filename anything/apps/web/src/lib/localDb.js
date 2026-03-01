import { withNamespace } from '@/lib/appNamespace';
import { getSupabaseClient, hasSupabaseConfig, tableName } from '@/lib/supabase';
import {
  APP_TIME_ZONE,
  formatDateKeyFromDate,
  getTodayInAppTimeZone,
  normalizeDateKey,
} from '@/lib/timezone';

const DB_KEY = withNamespace('local.db.v1');
const SESSION_KEY = withNamespace('local.session.v1');
const LOCAL_USERS_KEY = withNamespace('local.users.v1');

const LEGACY_DB_KEY = 'cbnads.local.db.v1';
const LEGACY_SESSION_KEY = 'cbnads.local.session.v1';
const LEGACY_LOCAL_USERS_KEY = 'cbnads.local.users.v1';

const DB_VERSION = 3;

const REQUIRED_LOCAL_USERS = [];

const LEGACY_TEST_USER_EMAILS = new Set(['admin@cbnads.local']);

const nowIso = () => new Date().toISOString();

const clone = (value) => JSON.parse(JSON.stringify(value));

const numberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isBrowser = () => typeof window !== 'undefined';

const canUseSupabase = () => isBrowser() && hasSupabaseConfig;

const storage = () => {
  if (!isBrowser()) {
    return null;
  }
  return window.localStorage;
};

const readStorageKey = (s, primaryKey, legacyKey) => s.getItem(primaryKey) ?? s.getItem(legacyKey);

const migrateLegacyKey = (s, primaryKey, legacyKey) => {
  if (!s || s.getItem(primaryKey)) {
    return;
  }
  const legacyValue = s.getItem(legacyKey);
  if (legacyValue) {
    s.setItem(primaryKey, legacyValue);
  }
};

const parseJson = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const createUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomHex = `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
    .padEnd(32, '0')
    .slice(0, 32);

  return `${randomHex.slice(0, 8)}-${randomHex.slice(8, 12)}-4${randomHex.slice(
    13,
    16,
  )}-8${randomHex.slice(17, 20)}-${randomHex.slice(20, 32)}`;
};

export const createId = () => createUuid();

const toDateOnly = (value) => {
  if (!value) {
    return '';
  }
  if (value instanceof Date) {
    return getTodayInAppTimeZone(value);
  }
  return normalizeDateKey(value);
};

const toDateColumn = (value) => {
  const date = toDateOnly(value);
  return date || null;
};

const toTimeOnly = (value) => {
  if (!value) {
    return '';
  }
  const text = String(value).trim();
  if (!text) {
    return '';
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text.slice(0, 5);
  }
  if (/^\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  const parsed = new Date(`1970-01-01T${text}`);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().slice(11, 16);
  }
  return text.slice(0, 5);
};

const toTimeColumn = (value) => {
  const timeOnly = toTimeOnly(value);
  if (!timeOnly) {
    return null;
  }
  if (/^\d{2}:\d{2}$/.test(timeOnly)) {
    return `${timeOnly}:00`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeOnly)) {
    return timeOnly;
  }
  return null;
};

const normalizePostType = (value) => {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (text === 'one_time_post' || text === 'one_time') {
    return 'one_time';
  }
  if (text === 'daily' || text === 'daily_run') {
    return 'daily_run';
  }
  if (text === 'custom' || text === 'custom_schedule') {
    return 'custom_schedule';
  }
  return text || 'one_time';
};

const toMoney = (value) => numberOrZero(value).toFixed(2);

const toArray = (value) => (Array.isArray(value) ? value : []);

const isMissingRelationError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist/i.test(message);
};

const isMissingColumnError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42703' || /column .* does not exist/i.test(message);
};

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const status = Number(error?.status || error?.statusCode || 0);
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    /permission denied/i.test(message) ||
    /row-level security/i.test(message) ||
    /not allowed/i.test(message)
  );
};

const throwIfSupabaseError = (label, error) => {
  if (!error) {
    return;
  }
  throw new Error(`${label}: ${error.message || 'Unknown Supabase error'}`);
};

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const normalizeAppRole = (value) => {
  const role = normalizeRole(value);
  if (role === 'advertiser') {
    return 'advertiser';
  }
  if (['owner', 'admin', 'manager', 'assistant', 'staff'].includes(role)) {
    return 'admin';
  }
  return role;
};

const loadTeamMemberRoleByEmail = async (supabase, email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return '';
  }

  const { data, error } = await supabase
    .from(tableName('team_members'))
    .select('role')
    .ilike('email', normalizedEmail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error) || isPermissionDeniedError(error)) {
      return '';
    }
    throwIfSupabaseError('select team member role', error);
  }

  return normalizeAppRole(data?.role);
};

const loadAdvertiserIdentity = async (
  supabase,
  { advertiserId = '', email = '', advertiserName = '' } = {},
) => {
  const normalizedAdvertiserId = String(advertiserId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(advertiserName || '').trim();

  if (normalizedAdvertiserId) {
    const { data, error } = await supabase
      .from(tableName('advertisers'))
      .select('id, advertiser_name, email')
      .eq('id', normalizedAdvertiserId)
      .maybeSingle();
    if (error && !isPermissionDeniedError(error)) {
      throwIfSupabaseError('select advertiser by id', error);
    }
    if (data?.id) {
      return data;
    }
  }

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from(tableName('advertisers'))
      .select('id, advertiser_name, email')
      .ilike('email', normalizedEmail)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error && !isPermissionDeniedError(error)) {
      throwIfSupabaseError('select advertiser by email', error);
    }
    if (data?.id) {
      return data;
    }
  }

  if (normalizedName) {
    const { data, error } = await supabase
      .from(tableName('advertisers'))
      .select('id, advertiser_name, email')
      .eq('advertiser_name', normalizedName)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error && !isPermissionDeniedError(error)) {
      throwIfSupabaseError('select advertiser by name', error);
    }
    if (data?.id) {
      return data;
    }
  }

  return null;
};

export const resolveSupabaseSessionUser = async (supabaseOverride = null) => {
  if (!canUseSupabase()) {
    return null;
  }

  const supabase = supabaseOverride || getSupabaseClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throwIfSupabaseError('get auth session', sessionError);
  }

  const authUser = sessionData?.session?.user || null;
  if (!authUser?.id) {
    setSessionUserId(null);
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  if (profileError && !isPermissionDeniedError(profileError)) {
    throwIfSupabaseError('select profile', profileError);
  }

  const email = String(authUser.email || profile?.email || '').trim().toLowerCase();
  const explicitRole =
    authUser?.user_metadata?.role || authUser?.app_metadata?.role || profile?.role || '';
  const teamRole = explicitRole ? '' : await loadTeamMemberRoleByEmail(supabase, email);
  const role = normalizeAppRole(explicitRole || teamRole || 'user');

  const advertiser = await loadAdvertiserIdentity(supabase, {
    advertiserId:
      authUser?.user_metadata?.advertiser_id ||
      authUser?.app_metadata?.advertiser_id ||
      profile?.advertiser_id ||
      '',
    email,
    advertiserName:
      authUser?.user_metadata?.advertiser_name ||
      profile?.full_name ||
      authUser?.user_metadata?.full_name ||
      '',
  });

  const resolvedUser = {
    id: authUser.id,
    email,
    name:
      String(
        authUser?.user_metadata?.full_name ||
          authUser?.user_metadata?.advertiser_name ||
          profile?.full_name ||
          authUser.email ||
          '',
      ).trim() || email,
    image:
      String(
        authUser?.user_metadata?.avatar_url ||
          authUser?.user_metadata?.image ||
          profile?.avatar_url ||
          '',
      ).trim() || '',
    role,
    advertiser_id: advertiser?.id || profile?.advertiser_id || null,
    advertiser_name:
      advertiser?.advertiser_name ||
      String(authUser?.user_metadata?.advertiser_name || '').trim() ||
      '',
    whatsapp_number: String(profile?.whatsapp_number || '').trim(),
    account_verified: authUser?.user_metadata?.account_verified === true,
  };

  setSessionUserId(resolvedUser.id);
  return resolvedUser;
};

const normalizeUsers = (rawUsers) => {
  const now = nowIso();
  const source = Array.isArray(rawUsers) ? rawUsers : [];
  const deduped = [];
  const seenEmails = new Set();

  for (const user of source) {
    if (!user || typeof user !== 'object') {
      continue;
    }

    const email = String(user.email || '').trim().toLowerCase();
    if (!email || LEGACY_TEST_USER_EMAILS.has(email)) {
      continue;
    }
    if (seenEmails.has(email)) {
      continue;
    }

    seenEmails.add(email);
    deduped.push({
      ...user,
      email,
      updated_at: user.updated_at || now,
      created_at: user.created_at || now,
    });
  }

  return deduped;
};

const baseDb = (users = []) => {
  const now = nowIso();
  return {
    version: DB_VERSION,
    users: normalizeUsers(users).map((user) => ({
      ...user,
      created_at: user.created_at || now,
      updated_at: user.updated_at || now,
    })),
    advertisers: [],
    products: [],
    ads: [],
    pending_ads: [],
    invoices: [],
    admin_settings: {
      max_ads_per_slot: 2,
      max_ads_per_day: 5,
      default_post_time: '09:00',
    },
    notification_preferences: {
      email_enabled: false,
      sms_enabled: false,
      reminder_time_value: 1,
      reminder_time_unit: 'hours',
      email_address: '',
      phone_number: '',
      sound_enabled: true,
      reminder_email: '',
    },
    telegram_chat_ids: [],
    team_members: [],
  };
};

const readLegacyUsersFromDbStorage = () => {
  const s = storage();
  if (!s) {
    return [];
  }
  const raw = readStorageKey(s, DB_KEY, LEGACY_DB_KEY);
  if (!raw) {
    return [];
  }
  const parsed = parseJson(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }
  return Array.isArray(parsed.users) ? parsed.users : [];
};

const readLocalUsers = () => {
  const s = storage();
  if (!s) {
    return normalizeUsers([]);
  }

  migrateLegacyKey(s, LOCAL_USERS_KEY, LEGACY_LOCAL_USERS_KEY);
  const rawUsers = readStorageKey(s, LOCAL_USERS_KEY, LEGACY_LOCAL_USERS_KEY);
  if (rawUsers) {
    const parsed = parseJson(rawUsers, []);
    return normalizeUsers(parsed);
  }

  const normalized = normalizeUsers([]);
  s.setItem(LOCAL_USERS_KEY, JSON.stringify(normalized));
  return normalized;
};

const persistLocalUsers = (users) => {
  const s = storage();
  if (!s) {
    return;
  }
  const normalized = normalizeUsers(users);
  s.setItem(LOCAL_USERS_KEY, JSON.stringify(normalized));
  s.removeItem(LEGACY_LOCAL_USERS_KEY);
};

const normalizeDb = (rawValue) => {
  const fallbackUsers = readLocalUsers();
  const seed = baseDb(fallbackUsers);
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : {};

  return {
    ...seed,
    ...raw,
    version: DB_VERSION,
    users: normalizeUsers(raw.users ?? fallbackUsers),
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
    telegram_chat_ids: Array.isArray(raw.telegram_chat_ids) ? raw.telegram_chat_ids : [],
    team_members: Array.isArray(raw.team_members) ? raw.team_members : [],
  };
};

const refreshDerivedFields = (inputDb) => {
  const db = normalizeDb(inputDb);
  const today = new Date();
  const spendByAdvertiser = new Map();
  const nextDateByAdvertiser = new Map();

  for (const ad of db.ads) {
    const advertiserId = ad.advertiser_id;
    if (!advertiserId) {
      continue;
    }

    if (String(ad.payment || '').toLowerCase() === 'paid') {
      const nextSpend = (spendByAdvertiser.get(advertiserId) ?? 0) + numberOrZero(ad.price);
      spendByAdvertiser.set(advertiserId, nextSpend);
    }

    const candidateDate = ad.post_date || ad.schedule || ad.post_date_from;
    if (candidateDate) {
      const postDate = new Date(candidateDate);
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
    const spend = Number(spendByAdvertiser.get(advertiser.id) ?? 0).toFixed(2);
    return {
      ...advertiser,
      ad_spend: spend,
      total_spend: spend,
      next_ad_date: nextDate ? formatDateKeyFromDate(nextDate) : advertiser.next_ad_date || '',
    };
  });

  return db;
};

const emitDbChanged = () => {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new CustomEvent('cbn:db-changed'));
};

const clearLegacyDbSnapshots = () => {
  const s = storage();
  if (!s) {
    return;
  }
  s.removeItem(DB_KEY);
  s.removeItem(LEGACY_DB_KEY);
};

const readLegacyDbFromStorage = () => {
  clearLegacyDbSnapshots();
  return refreshDerivedFields(normalizeDb(baseDb(readLocalUsers())));
};

const writeLegacyDbToStorage = (value) => {
  const normalized = refreshDerivedFields(normalizeDb(value));
  clearLegacyDbSnapshots();
  persistLocalUsers(normalized.users);
  dbCache = normalized;
  emitDbChanged();
  return clone(dbCache);
};

const fromAdvertiserRow = (row) => ({
  id: row.id,
  advertiser_name: row.advertiser_name || '',
  contact_name: row.contact_name || '',
  email: row.email || '',
  phone: row.phone ?? row.phone_number ?? '',
  phone_number: row.phone_number ?? row.phone ?? '',
  business_name: row.business_name || '',
  status: row.status || 'active',
  ad_spend: toMoney(row.ad_spend ?? row.total_spend),
  total_spend: toMoney(row.total_spend ?? row.ad_spend),
  next_ad_date: toDateOnly(row.next_ad_date),
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toAdvertiserRow = (input) => ({
  id: input.id || createId(),
  advertiser_name: String(input.advertiser_name || '').trim(),
  contact_name: String(input.contact_name || '').trim(),
  email: String(input.email || '').trim(),
  phone: String(input.phone || input.phone_number || '').trim(),
  phone_number: String(input.phone_number || input.phone || '').trim(),
  business_name: String(input.business_name || '').trim(),
  status: String(input.status || 'active'),
  ad_spend: toMoney(input.ad_spend ?? input.total_spend),
  total_spend: toMoney(input.total_spend ?? input.ad_spend),
  next_ad_date: toDateColumn(input.next_ad_date),
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromProductRow = (row) => ({
  id: row.id,
  product_name: row.product_name || '',
  placement: row.placement || 'WhatsApp',
  price: toMoney(row.price),
  description: row.description || '',
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toProductRow = (input) => ({
  id: input.id || createId(),
  product_name: String(input.product_name || '').trim(),
  placement: String(input.placement || 'WhatsApp').trim() || 'WhatsApp',
  price: toMoney(input.price),
  description: String(input.description || '').trim(),
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromAdRow = (row) => {
  const schedule = toDateOnly(row.schedule || row.post_date || row.post_date_from);
  return {
    id: row.id,
    ad_name: row.ad_name || '',
    advertiser_id: row.advertiser_id || '',
    advertiser: row.advertiser || '',
    product_id: row.product_id || '',
    product_name: row.product_name || '',
    post_type: normalizePostType(row.post_type),
    status: row.status || 'Draft',
    payment: row.payment || 'Unpaid',
    post_date: toDateOnly(row.post_date || row.schedule || row.post_date_from),
    schedule,
    post_date_from: toDateOnly(row.post_date_from || row.post_date || row.schedule),
    post_date_to: toDateOnly(row.post_date_to),
    post_time: toTimeOnly(row.post_time),
    custom_dates: toArray(row.custom_dates).map((date) => toDateOnly(date)).filter(Boolean),
    notes: row.notes || '',
    ad_text: row.ad_text || '',
    media: toArray(row.media),
    media_urls: toArray(row.media_urls),
    placement: row.placement || '',
    reminder_minutes: Number(row.reminder_minutes) || 15,
    price: toMoney(row.price),
    invoice_id: row.invoice_id || row.paid_via_invoice_id || null,
    paid_via_invoice_id: row.paid_via_invoice_id || row.invoice_id || null,
    archived: Boolean(row.archived),
    published_at: row.published_at || null,
    published_dates: toArray(row.published_dates),
    scheduled_timezone: String(row.scheduled_timezone || APP_TIME_ZONE).trim() || APP_TIME_ZONE,
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso(),
  };
};

const toAdRow = (input) => {
  const postDate = toDateOnly(input.post_date || input.schedule || input.post_date_from);
  const postDateFrom = toDateOnly(input.post_date_from || postDate);
  const paidViaInvoiceId = input.paid_via_invoice_id || input.invoice_id || null;
  return {
    id: input.id || createId(),
    ad_name: String(input.ad_name || '').trim(),
    advertiser_id: input.advertiser_id || null,
    advertiser: String(input.advertiser || '').trim(),
    product_id: input.product_id || null,
    product_name: String(input.product_name || '').trim(),
    post_type: normalizePostType(input.post_type),
    status: input.status || 'Draft',
    payment: input.payment || 'Unpaid',
    post_date: toDateColumn(postDate),
    schedule: toDateColumn(input.schedule || postDate),
    post_date_from: toDateColumn(postDateFrom),
    post_date_to: toDateColumn(input.post_date_to),
    post_time: toTimeColumn(input.post_time),
    custom_dates: toArray(input.custom_dates).map((date) => toDateOnly(date)).filter(Boolean),
    notes: String(input.notes || '').trim(),
    ad_text: String(input.ad_text || '').trim(),
    media: toArray(input.media),
    media_urls: toArray(input.media_urls),
    placement: String(input.placement || '').trim(),
    reminder_minutes: Number(input.reminder_minutes) || 15,
    price: toMoney(input.price),
    invoice_id: paidViaInvoiceId,
    paid_via_invoice_id: paidViaInvoiceId,
    archived: Boolean(input.archived),
    published_at: input.published_at || null,
    published_dates: toArray(input.published_dates),
    scheduled_timezone:
      String(input.scheduled_timezone || APP_TIME_ZONE).trim() || APP_TIME_ZONE,
    created_at: input.created_at || nowIso(),
    updated_at: input.updated_at || nowIso(),
  };
};

const fromPendingAdRow = (row) => ({
  id: row.id,
  advertiser_name: row.advertiser_name || '',
  contact_name: row.contact_name || '',
  email: row.email || '',
  phone: row.phone || row.phone_number || '',
  phone_number: row.phone_number || row.phone || '',
  business_name: row.business_name || '',
  ad_name: row.ad_name || '',
  post_type: normalizePostType(row.post_type),
  post_date: toDateOnly(row.post_date || row.post_date_from),
  post_date_from: toDateOnly(row.post_date_from || row.post_date),
  post_date_to: toDateOnly(row.post_date_to),
  custom_dates: toArray(row.custom_dates).map((date) => toDateOnly(date)).filter(Boolean),
  post_time: toTimeOnly(row.post_time),
  reminder_minutes: Number(row.reminder_minutes) || 15,
  ad_text: row.ad_text || '',
  media: toArray(row.media),
  placement: row.placement || '',
  notes: row.notes || '',
  status: row.status || 'pending',
  viewed_by_admin: Boolean(row.viewed_by_admin),
  rejected_at: row.rejected_at || null,
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toPendingAdRow = (input) => ({
  id: input.id || createId(),
  advertiser_name: String(input.advertiser_name || '').trim(),
  contact_name: String(input.contact_name || '').trim(),
  email: String(input.email || '').trim(),
  phone: String(input.phone || input.phone_number || '').trim(),
  phone_number: String(input.phone_number || input.phone || '').trim(),
  business_name: String(input.business_name || '').trim(),
  ad_name: String(input.ad_name || '').trim(),
  post_type: normalizePostType(input.post_type),
  post_date: toDateColumn(input.post_date || input.post_date_from),
  post_date_from: toDateColumn(input.post_date_from || input.post_date),
  post_date_to: toDateColumn(input.post_date_to),
  custom_dates: toArray(input.custom_dates).map((date) => toDateOnly(date)).filter(Boolean),
  post_time: toTimeColumn(input.post_time),
  reminder_minutes: Number(input.reminder_minutes) || 15,
  ad_text: String(input.ad_text || '').trim(),
  media: toArray(input.media),
  placement: String(input.placement || '').trim(),
  notes: String(input.notes || '').trim(),
  status: input.status || 'pending',
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromInvoiceRow = (row) => ({
  id: row.id,
  invoice_number: row.invoice_number || '',
  advertiser_id: row.advertiser_id || '',
  advertiser_name: row.advertiser_name || '',
  amount: toMoney(row.amount),
  due_date: toDateOnly(row.due_date),
  status: row.status || 'Unpaid',
  paid_date: toDateOnly(row.paid_date),
  ad_ids: toArray(row.ad_ids).filter(Boolean),
  contact_name: row.contact_name || '',
  contact_email: row.contact_email || '',
  bill_to: row.bill_to || '',
  issue_date: toDateOnly(row.issue_date),
  discount: toMoney(row.discount),
  tax: toMoney(row.tax),
  total: toMoney(row.total),
  notes: row.notes || '',
  amount_paid: toMoney(row.amount_paid),
  deleted_at: row.deleted_at || null,
  is_recurring: Boolean(row.is_recurring),
  recurring_period: row.recurring_period || '',
  last_generated_at: row.last_generated_at || null,
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toInvoiceRow = (input) => ({
  id: input.id || createId(),
  invoice_number: String(input.invoice_number || '').trim(),
  advertiser_id: input.advertiser_id || null,
  advertiser_name: String(input.advertiser_name || '').trim(),
  amount: toMoney(input.amount),
  due_date: toDateColumn(input.due_date),
  status: input.status || 'Unpaid',
  paid_date: toDateColumn(input.paid_date),
  ad_ids: toArray(input.ad_ids).filter(Boolean),
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromTeamMemberRow = (row) => ({
  id: row.id,
  name: row.name || '',
  email: row.email || '',
  role: row.role || 'member',
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toTeamMemberRow = (input) => ({
  id: input.id || createId(),
  name: String(input.name || '').trim(),
  email: String(input.email || '').trim(),
  role: String(input.role || 'member'),
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromAdminSettingsRow = (row) => ({
  max_ads_per_slot: Number(row?.max_ads_per_slot) || 2,
  max_ads_per_day:
    Number(row?.max_ads_per_day) || Number(row?.max_ads_per_slot) || 5,
  default_post_time: toTimeOnly(row?.default_post_time || '09:00') || '09:00',
  created_at: row?.created_at || nowIso(),
  updated_at: row?.updated_at || nowIso(),
});

const toAdminSettingsRow = (input) => {
  const maxAds = Math.max(
    1,
    Number(input?.max_ads_per_day || input?.max_ads_per_slot || 5),
  );
  return {
    max_ads_per_slot: maxAds,
    max_ads_per_day: maxAds,
    default_post_time: toTimeColumn(input?.default_post_time || '09:00'),
    updated_at: nowIso(),
  };
};

const toAdminSettingsFallbackRow = (input) => {
  const maxAds = Math.max(
    1,
    Number(input?.max_ads_per_day || input?.max_ads_per_slot || 5),
  );
  return {
    max_ads_per_slot: maxAds,
    default_post_time: toTimeColumn(input?.default_post_time || '09:00'),
    updated_at: nowIso(),
  };
};

const fromNotificationRows = (notificationRow, adminNotificationRow) => ({
  email_enabled:
    adminNotificationRow?.email_enabled ?? notificationRow?.email_enabled ?? false,
  sms_enabled: adminNotificationRow?.sms_enabled ?? false,
  reminder_time_value: Number(adminNotificationRow?.reminder_time_value) || 1,
  reminder_time_unit: adminNotificationRow?.reminder_time_unit || 'hours',
  email_address:
    adminNotificationRow?.email_address ||
    notificationRow?.reminder_email ||
    '',
  phone_number: adminNotificationRow?.phone_number || '',
  sound_enabled: adminNotificationRow?.sound_enabled ?? true,
  reminder_email:
    notificationRow?.reminder_email || adminNotificationRow?.email_address || '',
  telegram_chat_ids: toArray(adminNotificationRow?.telegram_chat_ids),
  created_at: notificationRow?.created_at || adminNotificationRow?.created_at || nowIso(),
  updated_at: notificationRow?.updated_at || adminNotificationRow?.updated_at || nowIso(),
});

const toNotificationRow = (input) => ({
  email_enabled: Boolean(input?.email_enabled),
  reminder_email: String(input?.reminder_email || input?.email_address || ''),
  updated_at: nowIso(),
});

const toAdminNotificationRow = (input) => ({
  email_enabled: Boolean(input?.email_enabled),
  sms_enabled: Boolean(input?.sms_enabled),
  reminder_time_value: Math.max(1, Number(input?.reminder_time_value) || 1),
  reminder_time_unit: String(input?.reminder_time_unit || 'hours'),
  email_address: String(input?.email_address || input?.reminder_email || ''),
  phone_number: String(input?.phone_number || ''),
  sound_enabled: input?.sound_enabled !== false,
  telegram_chat_ids: toArray(input?.telegram_chat_ids),
  updated_at: nowIso(),
});

let dbCache = normalizeDb(baseDb());
let hasPrimedCache = false;
let hasLoadedInitialState = false;
let ensurePromise = null;

const primeCacheFromLocal = () => {
  if (hasPrimedCache) {
    return;
  }
  hasPrimedCache = true;
  dbCache = refreshDerivedFields(normalizeDb(baseDb()));
};

const setDbCache = (value, { emit = true } = {}) => {
  const normalized = refreshDerivedFields(normalizeDb(value));
  clearLegacyDbSnapshots();
  persistLocalUsers(normalized.users);
  dbCache = normalized;
  if (emit) {
    emitDbChanged();
  }
  return clone(dbCache);
};

const fetchRows = async (
  supabase,
  baseName,
  {
    optional = false,
    allowPermissionDenied = false,
  } = {},
) => {
  const result = await supabase.from(tableName(baseName)).select('*');
  if (result.error) {
    if (
      optional &&
      (isMissingRelationError(result.error) ||
        (allowPermissionDenied && isPermissionDeniedError(result.error)))
    ) {
      return [];
    }
    throwIfSupabaseError(`select ${baseName}`, result.error);
  }
  return result.data || [];
};

const fetchSingleton = async (
  supabase,
  baseName,
  {
    optional = false,
    allowPermissionDenied = false,
  } = {},
) => {
  const result = await supabase.from(tableName(baseName)).select('*').order('id', { ascending: true }).limit(1);
  if (result.error) {
    if (
      optional &&
      (isMissingRelationError(result.error) ||
        (allowPermissionDenied && isPermissionDeniedError(result.error)))
    ) {
      return null;
    }
    throwIfSupabaseError(`select ${baseName}`, result.error);
  }
  return result.data?.[0] || null;
};

const fetchDbFromSupabase = async () => {
  const supabase = getSupabaseClient();
  const currentUser = await resolveSupabaseSessionUser(supabase);
  const [
    advertiserRows,
    productRows,
    adRows,
    pendingRows,
    invoiceRows,
    adminSettingsRow,
    notificationRow,
    teamMemberRows,
    adminNotificationRow,
  ] = await Promise.all([
    fetchRows(supabase, 'advertisers'),
    fetchRows(supabase, 'products', { optional: true, allowPermissionDenied: true }),
    fetchRows(supabase, 'ads'),
    fetchRows(supabase, 'pending_ads'),
    fetchRows(supabase, 'invoices'),
    fetchSingleton(supabase, 'admin_settings', { optional: true, allowPermissionDenied: true }),
    fetchSingleton(supabase, 'notification_preferences', {
      optional: true,
      allowPermissionDenied: true,
    }),
    fetchRows(supabase, 'team_members', { optional: true, allowPermissionDenied: true }),
    fetchSingleton(supabase, 'admin_notification_preferences', {
      optional: true,
      allowPermissionDenied: true,
    }),
  ]);

  const notificationPreferences = fromNotificationRows(
    notificationRow,
    adminNotificationRow,
  );
  const teamMembers = teamMemberRows.map(fromTeamMemberRow);
  if (
    currentUser?.id &&
    currentUser.role === 'admin' &&
    !teamMembers.some(
      (member) =>
        String(member.email || '').trim().toLowerCase() ===
        String(currentUser.email || '').trim().toLowerCase(),
    )
  ) {
    teamMembers.unshift({
      id: currentUser.id,
      name: currentUser.name || currentUser.email || 'Current User',
      email: currentUser.email || '',
      role: 'admin',
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  const users = currentUser ? normalizeUsers([currentUser]) : [];
  return refreshDerivedFields(
    normalizeDb({
      ...baseDb(users),
      users,
      advertisers: advertiserRows.map(fromAdvertiserRow),
      products: productRows.map(fromProductRow),
      ads: adRows.map(fromAdRow),
      pending_ads: pendingRows.map(fromPendingAdRow),
      invoices: invoiceRows.map(fromInvoiceRow),
      admin_settings: fromAdminSettingsRow(adminSettingsRow),
      notification_preferences: notificationPreferences,
      telegram_chat_ids: notificationPreferences.telegram_chat_ids,
      team_members: teamMembers,
    }),
  );
};

const syncIdTable = async (supabase, baseName, rows, { optional = false } = {}) => {
  const table = tableName(baseName);
  const normalizedRows = rows.filter((row) => row && row.id);

  if (normalizedRows.length > 0) {
    const upsertResult = await supabase.from(table).upsert(normalizedRows, { onConflict: 'id' });
    if (upsertResult.error) {
      if (optional && isMissingRelationError(upsertResult.error)) {
        return;
      }
      throwIfSupabaseError(`upsert ${baseName}`, upsertResult.error);
    }
  }

  const selectResult = await supabase.from(table).select('id');
  if (selectResult.error) {
    if (optional && isMissingRelationError(selectResult.error)) {
      return;
    }
    throwIfSupabaseError(`select ids ${baseName}`, selectResult.error);
  }

  const keepIds = new Set(normalizedRows.map((row) => String(row.id)));
  const deleteIds = (selectResult.data || [])
    .map((row) => row.id)
    .filter((id) => !keepIds.has(String(id)));

  if (deleteIds.length === 0) {
    return;
  }

  const deleteResult = await supabase.from(table).delete().in('id', deleteIds);
  throwIfSupabaseError(`delete missing ${baseName}`, deleteResult.error);
};

const syncSingletonTable = async (
  supabase,
  baseName,
  row,
  {
    optional = false,
    fallbackRow = null,
  } = {},
) => {
  const table = tableName(baseName);
  const existing = await supabase.from(table).select('id').order('id', { ascending: true }).limit(1);
  if (existing.error) {
    if (optional && isMissingRelationError(existing.error)) {
      return;
    }
    throwIfSupabaseError(`select singleton ${baseName}`, existing.error);
  }

  const target = existing.data?.[0] || null;
  if (!target) {
    const insertResult = await supabase.from(table).insert(row);
    if (!insertResult.error) {
      return;
    }
    if (fallbackRow && isMissingColumnError(insertResult.error)) {
      const fallbackInsert = await supabase.from(table).insert(fallbackRow);
      throwIfSupabaseError(`insert singleton ${baseName}`, fallbackInsert.error);
      return;
    }
    if (optional && isMissingRelationError(insertResult.error)) {
      return;
    }
    throwIfSupabaseError(`insert singleton ${baseName}`, insertResult.error);
    return;
  }

  const updateResult = await supabase.from(table).update(row).eq('id', target.id);
  if (!updateResult.error) {
    return;
  }
  if (fallbackRow && isMissingColumnError(updateResult.error)) {
    const fallbackUpdate = await supabase.from(table).update(fallbackRow).eq('id', target.id);
    throwIfSupabaseError(`update singleton ${baseName}`, fallbackUpdate.error);
    return;
  }
  if (optional && isMissingRelationError(updateResult.error)) {
    return;
  }
  throwIfSupabaseError(`update singleton ${baseName}`, updateResult.error);
};

const persistDbToSupabase = async (value) => {
  const db = refreshDerivedFields(normalizeDb(value));
  const supabase = getSupabaseClient();

  await syncIdTable(supabase, 'advertisers', db.advertisers.map(toAdvertiserRow));
  await syncIdTable(supabase, 'products', db.products.map(toProductRow));
  await syncIdTable(supabase, 'team_members', db.team_members.map(toTeamMemberRow));
  await syncIdTable(supabase, 'pending_ads', db.pending_ads.map(toPendingAdRow));
  await syncIdTable(supabase, 'invoices', db.invoices.map(toInvoiceRow));
  await syncIdTable(supabase, 'ads', db.ads.map(toAdRow));

  await syncSingletonTable(
    supabase,
    'admin_settings',
    toAdminSettingsRow(db.admin_settings),
    { fallbackRow: toAdminSettingsFallbackRow(db.admin_settings) },
  );
  await syncSingletonTable(
    supabase,
    'notification_preferences',
    toNotificationRow(db.notification_preferences),
  );
  await syncSingletonTable(
    supabase,
    'admin_notification_preferences',
    toAdminNotificationRow({
      ...db.notification_preferences,
      telegram_chat_ids: db.telegram_chat_ids,
    }),
    { optional: true },
  );
};

const hydrateCache = async () => {
  primeCacheFromLocal();
  if (!canUseSupabase()) {
    const emptyDb = refreshDerivedFields(normalizeDb(baseDb(readLocalUsers())));
    setDbCache(emptyDb, { emit: false });
    hasLoadedInitialState = true;
    return clone(dbCache);
  }

  const remoteDb = await fetchDbFromSupabase();
  setDbCache(remoteDb, { emit: false });
  hasLoadedInitialState = true;
  return clone(dbCache);
};

export const ensureDb = async () => {
  primeCacheFromLocal();

  if (hasLoadedInitialState) {
    return clone(dbCache);
  }

  if (!ensurePromise) {
    ensurePromise = hydrateCache()
      .catch((error) => {
        console.error('[localDb] Failed to load Supabase data; using empty remote cache.', error);
        const fallback = refreshDerivedFields(normalizeDb(baseDb()));
        setDbCache(fallback, { emit: false });
        hasLoadedInitialState = true;
        return clone(dbCache);
      })
      .finally(() => {
        ensurePromise = null;
        emitDbChanged();
      });
  }

  return ensurePromise;
};

export const readDb = () => {
  primeCacheFromLocal();
  return clone(dbCache);
};

export const writeDb = async (value) => {
  await ensureDb();
  const normalized = refreshDerivedFields(normalizeDb(value));
  persistLocalUsers(normalized.users);

  if (!canUseSupabase()) {
    throw new Error('Supabase configuration is required to persist app data.');
  }

  await persistDbToSupabase(normalized);
  return setDbCache(normalized, { emit: true });
};

export const updateDb = async (updater) => {
  const current = readDb();
  const draft = clone(current);
  const maybeNext = updater(draft);
  const resolvedNext = maybeNext instanceof Promise ? await maybeNext : maybeNext;
  return writeDb(resolvedNext ?? draft);
};

export const subscribeDb = (listener) => {
  if (!isBrowser()) {
    return () => {};
  }

  const trackedKeys = new Set([
    SESSION_KEY,
    LOCAL_USERS_KEY,
    LEGACY_SESSION_KEY,
    LEGACY_LOCAL_USERS_KEY,
  ]);

  const onStorage = (event) => {
    if (trackedKeys.has(event.key)) {
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
  migrateLegacyKey(s, SESSION_KEY, LEGACY_SESSION_KEY);
  return readStorageKey(s, SESSION_KEY, LEGACY_SESSION_KEY);
};

export const setSessionUserId = (userId) => {
  const s = storage();
  if (!s) {
    return;
  }
  migrateLegacyKey(s, SESSION_KEY, LEGACY_SESSION_KEY);
  if (userId) {
    s.setItem(SESSION_KEY, userId);
  } else {
    s.removeItem(SESSION_KEY);
    s.removeItem(LEGACY_SESSION_KEY);
  }
  emitDbChanged();
};

export const clearSession = () => setSessionUserId(null);

export const resetDbCache = ({ emit = true } = {}) => {
  const emptyDb = refreshDerivedFields(normalizeDb(baseDb()));
  clearLegacyDbSnapshots();
  persistLocalUsers([]);
  dbCache = emptyDb;
  hasPrimedCache = true;
  hasLoadedInitialState = false;
  ensurePromise = null;
  if (emit) {
    emitDbChanged();
  }
  return clone(dbCache);
};

export const upsertLocalUser = async (input) => {
  primeCacheFromLocal();
  const current = clone(dbCache);
  const now = nowIso();
  const email = String(input?.email || '')
    .trim()
    .toLowerCase();
  const existingIndex = current.users.findIndex(
    (item) => item.id === input?.id || String(item.email || '').trim().toLowerCase() === email,
  );
  const existing = existingIndex >= 0 ? current.users[existingIndex] : null;
  const payload = {
    ...(existing || {}),
    ...(input || {}),
    email,
    created_at: existing?.created_at || input?.created_at || now,
    updated_at: now,
  };

  if (existingIndex >= 0) {
    current.users[existingIndex] = payload;
  } else {
    current.users.unshift(payload);
  }

  setDbCache(current, { emit: true });
  return clone(payload);
};

export const upsertAdvertiser = async (input) => {
  let saved = null;
  await updateDb((db) => {
    const now = nowIso();
    const phone = (input.phone_number || input.phone || '').trim();
    const payload = {
      id: input.id || createId('adv'),
      advertiser_name: (input.advertiser_name || '').trim(),
      contact_name: (input.contact_name || '').trim(),
      email: (input.email || '').trim(),
      phone,
      phone_number: phone,
      business_name: (input.business_name || '').trim(),
      status: input.status || 'active',
      ad_spend: toMoney(input.ad_spend ?? input.total_spend),
      total_spend: toMoney(input.total_spend ?? input.ad_spend),
      next_ad_date: toDateOnly(input.next_ad_date),
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

export const deleteAdvertiser = async (advertiserId) => {
  await updateDb((db) => {
    db.advertisers = db.advertisers.filter((item) => item.id !== advertiserId);
    db.ads = db.ads.map((ad) =>
      ad.advertiser_id === advertiserId
        ? { ...ad, advertiser_id: '', advertiser: ad.advertiser || 'Unknown advertiser' }
        : ad
    );
    return db;
  });
};

export const upsertProduct = async (input) => {
  let saved = null;
  await updateDb((db) => {
    const now = nowIso();
    const payload = {
      id: input.id || createId('prd'),
      product_name: (input.product_name || '').trim(),
      placement: (input.placement || 'WhatsApp').trim() || 'WhatsApp',
      price: toMoney(input.price),
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

export const deleteProduct = async (productId) => {
  await updateDb((db) => {
    db.products = db.products.filter((item) => item.id !== productId);
    db.ads = db.ads.map((ad) =>
      ad.product_id === productId ? { ...ad, product_id: '', product_name: ad.product_name || '' } : ad
    );
    return db;
  });
};

export const upsertAd = async (input) => {
  let saved = null;
  await updateDb((db) => {
    const now = nowIso();
    const advertiser = db.advertisers.find((item) => item.id === input.advertiser_id);
    const product = db.products.find((item) => item.id === input.product_id);
    const postDate = toDateOnly(input.post_date || input.schedule || input.post_date_from);
    const paidViaInvoiceId = input.paid_via_invoice_id || input.invoice_id || null;
    const payload = {
      id: input.id || createId('ad'),
      ad_name: (input.ad_name || '').trim(),
      advertiser_id: input.advertiser_id || '',
      advertiser: advertiser?.advertiser_name || input.advertiser || '',
      product_id: input.product_id || '',
      product_name: product?.product_name || input.product_name || '',
      post_type: normalizePostType(input.post_type || 'one_time'),
      status: input.status || 'Draft',
      payment: input.payment || 'Unpaid',
      post_date: postDate,
      schedule: postDate,
      post_date_from: toDateOnly(input.post_date_from || postDate),
      post_date_to: toDateOnly(input.post_date_to),
      post_time: toTimeOnly(input.post_time),
      custom_dates: toArray(input.custom_dates).map((date) => toDateOnly(date)).filter(Boolean),
      notes: input.notes || '',
      ad_text: input.ad_text || '',
      media: toArray(input.media),
      media_urls: toArray(input.media_urls),
      placement: input.placement || '',
      reminder_minutes: Number(input.reminder_minutes) || 15,
      price: toMoney(input.price),
      invoice_id: paidViaInvoiceId,
      paid_via_invoice_id: paidViaInvoiceId,
      archived: Boolean(input.archived),
      published_at: input.published_at || null,
      published_dates: toArray(input.published_dates),
      scheduled_timezone:
        String(input.scheduled_timezone || APP_TIME_ZONE).trim() || APP_TIME_ZONE,
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

export const deleteAd = async (adId) => {
  await updateDb((db) => {
    db.ads = db.ads.filter((item) => item.id !== adId);
    db.invoices = db.invoices.map((invoice) => ({
      ...invoice,
      ad_ids: (invoice.ad_ids || []).filter((id) => id !== adId),
    }));
    return db;
  });
};

export const updateAdStatus = async (adId, status) => {
  await updateDb((db) => {
    db.ads = db.ads.map((ad) => (ad.id === adId ? { ...ad, status, updated_at: nowIso() } : ad));
    return db;
  });
};

export const updateAdPayment = async (adId, payment) => {
  await updateDb((db) => {
    db.ads = db.ads.map((ad) => (ad.id === adId ? { ...ad, payment, updated_at: nowIso() } : ad));
    return db;
  });
};

export const submitPendingAd = async (input) => {
  let saved = null;
  await updateDb((db) => {
    const postDateFrom = input.post_date_from || input.post_date || '';
    const postDateTo = input.post_date_to || '';
    const customDates = Array.isArray(input.custom_dates) ? input.custom_dates.filter(Boolean) : [];
    const phone = (input.phone || input.phone_number || '').trim();
    const payload = {
      id: input.id || createId('pending'),
      advertiser_name: (input.advertiser_name || '').trim(),
      contact_name: (input.contact_name || '').trim(),
      email: (input.email || '').trim(),
      phone,
      phone_number: phone,
      business_name: (input.business_name || '').trim(),
      ad_name: (input.ad_name || '').trim(),
      post_type: normalizePostType(input.post_type || 'one_time'),
      post_date: toDateOnly(input.post_date || postDateFrom || customDates[0]),
      post_date_from: toDateOnly(postDateFrom),
      post_date_to: toDateOnly(postDateTo),
      custom_dates: customDates.map((date) => toDateOnly(date)).filter(Boolean),
      post_time: toTimeOnly(input.post_time),
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

export const approvePendingAd = async (pendingAdId) => {
  await updateDb((db) => {
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
        contact_name: pending.contact_name || '',
        email: pending.email || '',
        phone: pending.phone || pending.phone_number || '',
        phone_number: pending.phone_number || pending.phone || '',
        business_name: pending.business_name || '',
        status: 'active',
        ad_spend: '0.00',
        total_spend: '0.00',
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
      post_type: normalizePostType(pending.post_type || 'one_time'),
      status: 'Draft',
      payment: 'Unpaid',
      post_date: postDate,
      schedule: postDate,
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

export const rejectPendingAd = async (pendingAdId) => {
  await updateDb((db) => {
    db.pending_ads = db.pending_ads.map((item) =>
      item.id === pendingAdId ? { ...item, status: 'not_approved', updated_at: nowIso() } : item
    );
    return db;
  });
};

export const deletePendingAd = async (pendingAdId) => {
  await updateDb((db) => {
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

export const upsertInvoice = async (input) => {
  let saved = null;
  await updateDb((db) => {
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
      amount: toMoney(input.amount),
      due_date: toDateOnly(input.due_date),
      status: input.status || 'Unpaid',
      paid_date: input.status === 'Paid' ? toDateOnly(input.paid_date || now.slice(0, 10)) : '',
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

export const deleteInvoice = async (invoiceId) => {
  await updateDb((db) => {
    const invoice = db.invoices.find((item) => item.id === invoiceId);
    const linkedAdIds = invoice?.ad_ids || [];
    db.invoices = db.invoices.filter((item) => item.id !== invoiceId);
    applyInvoiceLinks(db, invoiceId, linkedAdIds, [], 'Unpaid');
    return db;
  });
};

export const upsertTeamMember = async (input) => {
  let saved = null;
  await updateDb((db) => {
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

export const deleteTeamMember = async (memberId) => {
  await updateDb((db) => {
    db.team_members = db.team_members.filter((member) => member.id !== memberId);
    return db;
  });
};

export const saveAdminSettings = async (settings) => {
  await updateDb((db) => {
    db.admin_settings = {
      ...db.admin_settings,
      ...settings,
    };
    return db;
  });
};

export const saveNotificationPreferences = async (preferences) => {
  await updateDb((db) => {
    db.notification_preferences = {
      ...db.notification_preferences,
      ...preferences,
    };
    return db;
  });
};

export const resetDb = async () => {
  await writeDb(baseDb(readLocalUsers()));
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
      .join(','),
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
