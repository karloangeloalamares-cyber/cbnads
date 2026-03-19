import { withNamespace } from '@/lib/appNamespace';
import { getSupabaseClient, hasSupabaseConfig, tableName } from '@/lib/supabase';
import {
  APP_TIME_ZONE,
  formatDateKeyFromDate,
  getTodayInAppTimeZone,
  normalizeDateKey,
} from '@/lib/timezone';
import {
  invoicePaymentProviderRequiresNote,
  invoicePaymentProviderRequiresReference,
  normalizeInvoicePaymentProvider,
} from '@/lib/invoicePayment';
import { normalizeUSPhoneNumber } from '@/lib/phone';
import { isInternalRole, normalizeAppRole } from '@/lib/permissions';
import { formatPostTypeLabel, normalizePostTypeValue } from '@/lib/postType';

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

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim();
const sameId = (left, right) => {
  const normalizedLeft = normalizeId(left);
  const normalizedRight = normalizeId(right);
  return normalizedLeft && normalizedLeft === normalizedRight;
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

const normalizePostType = (value) => normalizePostTypeValue(value);

const toMoney = (value) => numberOrZero(value).toFixed(2);

const roundCurrencyValue = (value) => Math.round(numberOrZero(value) * 100) / 100;

const toArray = (value) => (Array.isArray(value) ? value : []);
const WHATSAPP_E164_LIKE_REGEX = /^\+?\d{8,15}$/;
const normalizeWhatsAppPhoneE164 = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  const normalized = `+${digits}`;
  return WHATSAPP_E164_LIKE_REGEX.test(normalized) ? normalized : '';
};
const normalizeWhatsAppRecipients = (value) => {
  const list = toArray(value);
  const normalized = [];
  const seen = new Set();

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const phone = normalizeWhatsAppPhoneE164(
      entry.phone_e164 || entry.phone || entry.to || entry.recipient,
    );
    if (!phone) {
      continue;
    }

    const key = phone.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    normalized.push({
      id: String(entry.id || phone).trim() || phone,
      label: String(entry.label || phone).trim() || phone,
      phone_e164: phone,
      is_active: entry.is_active !== false,
      created_at: entry.created_at || null,
      updated_at: entry.updated_at || null,
    });
  }

  return normalized;
};
const normalizeWhatsAppSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const rawMode = String(source.send_mode || source.default_send_mode || 'text')
    .trim()
    .toLowerCase();
  const sendMode = ['text', 'template', 'auto'].includes(rawMode) ? rawMode : 'text';
  const templateLanguage = String(source.template_language || 'en_US').trim() || 'en_US';
  const templateName = String(source.template_name || '').trim();

  return {
    enabled: source.enabled !== false,
    include_media: source.include_media !== false,
    use_template_fallback: source.use_template_fallback === true,
    send_mode: sendMode,
    template_name: templateName || null,
    template_language: templateLanguage,
  };
};
const normalizeCustomDateEntry = (entry) => {
  if (entry && typeof entry === 'object') {
    const date = toDateOnly(entry.date);
    if (!date) {
      return null;
    }

    const normalized = {
      ...entry,
      date,
    };
    const time = toTimeOnly(entry.time || entry.post_time);
    if (time) {
      normalized.time = time;
    } else {
      delete normalized.time;
    }

    const reminder = String(entry.reminder || '').trim();
    if (reminder) {
      normalized.reminder = reminder;
    } else {
      delete normalized.reminder;
    }

    return normalized;
  }

  const date = toDateOnly(entry);
  return date || null;
};
const normalizeCustomDateEntries = (value) =>
  toArray(value).map(normalizeCustomDateEntry).filter(Boolean);
const customDateEntryToDateKey = (entry) => {
  if (entry && typeof entry === 'object') {
    return toDateOnly(entry.date);
  }
  return toDateOnly(entry);
};
const firstCustomDateKey = (value) => {
  for (const entry of normalizeCustomDateEntries(value)) {
    const date = customDateEntryToDateKey(entry);
    if (date) {
      return date;
    }
  }
  return '';
};
const toUniqueTrimmedList = (value) => {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];

  for (const item of source) {
    const text = String(item || '').trim();
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(text);
  }

  return next;
};

const toInvoiceDateDigits = (value = new Date()) => {
  const dateKey = toDateOnly(value) || getTodayInAppTimeZone();
  return String(dateKey).replace(/-/g, '').slice(0, 8);
};

const INVOICE_SUFFIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateInvoiceSuffix = () =>
  Array.from({ length: 4 }, () =>
    INVOICE_SUFFIX_CHARS[Math.floor(Math.random() * INVOICE_SUFFIX_CHARS.length)],
  ).join('');

const nextLocalInvoiceNumber = (db, { dateValue = new Date() } = {}) => {
  const dateDigits = toInvoiceDateDigits(dateValue);
  const existing = new Set(
    toArray(db?.invoices).map((inv) => String(inv?.invoice_number || '').toUpperCase()),
  );

  let candidate;
  let attempts = 0;
  do {
    candidate = `INV-${dateDigits}-${generateInvoiceSuffix()}`;
    if (++attempts > 100) break;
  } while (existing.has(candidate));

  return candidate;
};

const formatInvoiceDateLabel = (dateKey) => {
  const normalizedDate = toDateOnly(dateKey);
  if (!normalizedDate) {
    return '';
  }
  const parsed = new Date(`${normalizedDate}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) {
    return normalizedDate;
  }
  return parsed.toLocaleDateString('en-US');
};

const expandDateRangeKeys = (from, to) => {
  const startKey = toDateOnly(from);
  const endKey = toDateOnly(to || from);
  if (!startKey || !endKey) {
    return [];
  }

  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(`${endKey}T00:00:00`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
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

const extractScheduleDateKeys = (adItem) => {
  const postType = normalizePostType(adItem?.post_type);
  if (postType === 'daily_run') {
    const from = adItem?.post_date_from || adItem?.post_date || adItem?.schedule;
    const to = adItem?.post_date_to || from;
    const expanded = expandDateRangeKeys(from, to);
    if (expanded.length > 0) {
      return expanded;
    }
  }

  if (postType === 'custom_schedule') {
    const customDates = normalizeCustomDateEntries(adItem?.custom_dates)
      .map((entry) => customDateEntryToDateKey(entry))
      .filter(Boolean);
    if (customDates.length > 0) {
      return Array.from(new Set(customDates));
    }
  }

  const singleDate = toDateOnly(adItem?.post_date_from || adItem?.post_date || adItem?.schedule);
  return singleDate ? [singleDate] : [];
};

const buildDerivedInvoiceItemsForAd = ({ adItem, invoiceId, existingItems = [], now }) => {
  const existingByIndex = toArray(existingItems);
  const dateKeys = extractScheduleDateKeys(adItem);
  const unitPrice = toMoney(adItem?.price);
  const baseDescription = adItem?.product_name
    ? `${adItem.product_name}${adItem.ad_name ? ` | Ad: ${adItem.ad_name}` : ''}`
    : adItem?.ad_name || 'Advertising services';

  if (dateKeys.length <= 1) {
    return [
      {
        id: existingByIndex[0]?.id || createId('inv_item'),
        invoice_id: invoiceId,
        ad_id: adItem.id,
        product_id: adItem.product_id || null,
        description:
          dateKeys[0] && baseDescription
            ? `${baseDescription} - ${formatInvoiceDateLabel(dateKeys[0])}`
            : baseDescription,
        quantity: 1,
        unit_price: unitPrice,
        amount: unitPrice,
        created_at: existingByIndex[0]?.created_at || now,
      },
    ];
  }

  return dateKeys.map((dateKey, index) => ({
    id: existingByIndex[index]?.id || createId('inv_item'),
    invoice_id: invoiceId,
    ad_id: adItem.id,
    product_id: adItem.product_id || null,
    description: `${baseDescription} - ${formatInvoiceDateLabel(dateKey)}`,
    quantity: 1,
    unit_price: unitPrice,
    amount: unitPrice,
    created_at: existingByIndex[index]?.created_at || now,
  }));
};

const rebalanceInvoiceItemsToSubtotal = (items, targetSubtotal) => {
  const sourceItems = toArray(items);
  if (sourceItems.length === 0) {
    return [];
  }

  const normalizedTarget = Math.max(roundCurrencyValue(targetSubtotal), 0);
  if (normalizedTarget <= 0) {
    return sourceItems.map((item) => ({
      ...item,
      quantity: Math.max(1, Number(item?.quantity) || 1),
      unit_price: toMoney(0),
      amount: toMoney(0),
    }));
  }

  const currentSubtotal = sourceItems.reduce(
    (sum, item) => sum + numberOrZero(item?.amount ?? item?.unit_price),
    0,
  );
  let distributed = 0;

  return sourceItems.map((item, index) => {
    const quantity = Math.max(1, Number(item?.quantity) || 1);
    let nextAmount = 0;

    if (index === sourceItems.length - 1) {
      nextAmount = roundCurrencyValue(Math.max(normalizedTarget - distributed, 0));
    } else if (currentSubtotal > 0) {
      const baseAmount = numberOrZero(item?.amount ?? item?.unit_price);
      nextAmount = roundCurrencyValue((baseAmount / currentSubtotal) * normalizedTarget);
    } else {
      nextAmount = roundCurrencyValue(normalizedTarget / sourceItems.length);
    }

    distributed = roundCurrencyValue(distributed + nextAmount);
    return {
      ...item,
      quantity,
      unit_price: toMoney(roundCurrencyValue(nextAmount / quantity)),
      amount: toMoney(nextAmount),
    };
  });
};

const buildSubmissionReviewNotes = ({ reasons = [], note = '' } = {}) => {
  const normalizedReasons = toUniqueTrimmedList(reasons).slice(0, 20);
  const normalizedNote = String(note || '').trim();
  const chunks = [];

  if (normalizedReasons.length > 0) {
    chunks.push(`Rejection reasons:\n${normalizedReasons.map((reason) => `- ${reason}`).join('\n')}`);
  }
  if (normalizedNote) {
    chunks.push(`Reviewer notes:\n${normalizedNote}`);
  }

  return chunks.join('\n\n').trim();
};

const isMissingRelationError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist/i.test(message);
};

const isMissingColumnError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const details = String(error?.details || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(details) ||
    /could not find the .* column/i.test(details) ||
    /schema cache/i.test(details)
  );
};

const isUniqueConstraintError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === '23505' || /duplicate key/i.test(message) || /unique constraint/i.test(message);
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

const isOptionalSyncError = (error) =>
  isMissingRelationError(error) ||
  isMissingColumnError(error) ||
  isPermissionDeniedError(error) ||
  isUniqueConstraintError(error);

const throwIfSupabaseError = (label, error) => {
  if (!error) {
    return;
  }
  throw new Error(`${label}: ${error.message || 'Unknown Supabase error'}`);
};

const unsupportedColumnsByTable = new Map();

const getKnownUnsupportedColumns = (table) => unsupportedColumnsByTable.get(String(table || '')) || new Set();

const rememberUnsupportedColumns = (table, columns) => {
  const tableKey = String(table || '');
  if (!tableKey || !Array.isArray(columns) || columns.length === 0) {
    return;
  }

  const next = new Set(getKnownUnsupportedColumns(tableKey));
  columns.forEach((column) => {
    const normalized = String(column || '').trim();
    if (normalized) {
      next.add(normalized);
    }
  });
  unsupportedColumnsByTable.set(tableKey, next);
};

const stripUnsupportedColumns = (rows, columns) => {
  const unsupported = Array.isArray(columns)
    ? columns.map((column) => String(column || '').trim()).filter(Boolean)
    : [];
  if (unsupported.length === 0) {
    return toArray(rows);
  }

  return toArray(rows).map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }

    const nextRow = { ...row };
    unsupported.forEach((column) => {
      delete nextRow[column];
    });
    return nextRow;
  });
};

const extractMissingColumnsFromError = (error) => {
  if (!isMissingColumnError(error)) {
    return [];
  }

  const chunks = [
    String(error?.message || ''),
    String(error?.details || ''),
    String(error?.hint || ''),
  ].filter(Boolean);
  const columns = new Set();
  const patterns = [
    /column ['"]?([a-zA-Z0-9_]+)['"]?/gi,
    /could not find the ['"]([a-zA-Z0-9_]+)['"] column/gi,
  ];

  for (const chunk of chunks) {
    for (const pattern of patterns) {
      for (const match of chunk.matchAll(pattern)) {
        const column = String(match?.[1] || '').trim();
        if (column) {
          columns.add(column);
        }
      }
    }
  }

  return [...columns];
};

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

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

  let authUser = sessionData?.session?.user || null;
  if (!authUser?.id) {
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      authUser = refreshData?.session?.user || null;
    } catch {
      authUser = null;
    }
  }

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
    whatsapp_number: normalizeUSPhoneNumber(profile?.whatsapp_number || ''),
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
      telegram_enabled: false,
      reminder_time_value: 1,
      reminder_time_unit: 'hours',
      email_address: '',
      phone_number: '',
      sound_enabled: true,
      reminder_email: '',
      whatsapp_recipients: [],
      whatsapp_settings: {
        enabled: true,
        include_media: true,
        use_template_fallback: false,
        send_mode: 'text',
        template_name: null,
        template_language: 'en_US',
      },
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

const repairDbReferences = (inputDb) => {
  const db = normalizeDb(inputDb);
  const invoiceIds = new Set(
    db.invoices
      .map((invoice) => String(invoice?.id || '').trim())
      .filter(Boolean),
  );
  const adIds = new Set(
    db.ads
      .map((ad) => String(ad?.id || '').trim())
      .filter(Boolean),
  );
  const productIds = new Set(
    db.products
      .map((product) => String(product?.id || '').trim())
      .filter(Boolean),
  );

  db.ads = db.ads.map((ad) => {
    const invoiceId = String(ad?.invoice_id || '').trim();
    const paidViaInvoiceId = String(ad?.paid_via_invoice_id || '').trim();
    const linkedInvoiceId = paidViaInvoiceId || invoiceId;

    if (!linkedInvoiceId || invoiceIds.has(linkedInvoiceId)) {
      return ad;
    }

    return {
      ...ad,
      invoice_id: null,
      paid_via_invoice_id: null,
    };
  });

  db.invoices = db.invoices.map((invoice) => {
    const explicitAdIds = toArray(invoice?.ad_ids)
      .map((id) => normalizeId(id))
      .filter((id) => adIds.has(id));
    const items = toArray(invoice?.items).map((item) => ({
      ...item,
      invoice_id: invoice.id,
      ad_id: adIds.has(normalizeId(item?.ad_id)) ? item.ad_id : null,
      product_id: productIds.has(normalizeId(item?.product_id))
        ? item.product_id
        : null,
    }));
    const itemAdIds = items
      .map((item) => normalizeId(item?.ad_id))
      .filter(Boolean);

    return {
      ...invoice,
      ad_ids: explicitAdIds.length > 0 ? explicitAdIds : [...new Set(itemAdIds)],
      items,
    };
  });

  return db;
};

const refreshDerivedFields = (inputDb) => {
  const db = repairDbReferences(inputDb);
  const today = new Date();
  const spendByAdvertiser = new Map();
  const nextDateByAdvertiser = new Map();

  for (const invoice of db.invoices) {
    const advertiserId = invoice.advertiser_id;
    if (!advertiserId) {
      continue;
    }

    const status = normalizeText(invoice.status);
    if (status === 'paid') {
      const nextSpend =
        (spendByAdvertiser.get(advertiserId) ?? 0) +
        numberOrZero(invoice.total ?? invoice.amount_paid ?? invoice.amount);
      spendByAdvertiser.set(advertiserId, nextSpend);
    }
  }

  for (const ad of db.ads) {
    const advertiserId = ad.advertiser_id;
    if (!advertiserId) {
      continue;
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
  phone: normalizeUSPhoneNumber(row.phone ?? row.phone_number ?? ''),
  phone_number: normalizeUSPhoneNumber(row.phone_number ?? row.phone ?? ''),
  business_name: row.business_name || '',
  status: row.status || 'active',
  ad_spend: toMoney(row.ad_spend ?? row.total_spend),
  total_spend: toMoney(row.total_spend ?? row.ad_spend),
  credits: toMoney(row.credits),
  next_ad_date: toDateOnly(row.next_ad_date),
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toAdvertiserRow = (input) => ({
  id: input.id || createId(),
  advertiser_name: String(input.advertiser_name || '').trim(),
  contact_name: String(input.contact_name || '').trim(),
  email: String(input.email || '').trim(),
  phone: normalizeUSPhoneNumber(input.phone || input.phone_number || ''),
  phone_number: normalizeUSPhoneNumber(input.phone_number || input.phone || ''),
  business_name: String(input.business_name || '').trim(),
  status: String(input.status || 'active'),
  ad_spend: toMoney(input.ad_spend ?? input.total_spend),
  total_spend: toMoney(input.total_spend ?? input.ad_spend),
  credits: toMoney(input.credits),
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
    custom_dates: normalizeCustomDateEntries(row.custom_dates),
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
    series_id: row.series_id || null,
    series_index: Number.isFinite(Number(row.series_index)) ? Number(row.series_index) : null,
    series_total: Number.isFinite(Number(row.series_total)) ? Number(row.series_total) : null,
    series_week_start: toDateOnly(row.series_week_start),
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
    custom_dates: normalizeCustomDateEntries(input.custom_dates),
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
    series_id: input.series_id || null,
    series_index:
      Number.isFinite(Number(input.series_index)) && Number(input.series_index) > 0
        ? Number(input.series_index)
        : null,
    series_total:
      Number.isFinite(Number(input.series_total)) && Number(input.series_total) > 0
        ? Number(input.series_total)
        : null,
    series_week_start: toDateColumn(input.series_week_start),
    scheduled_timezone:
      String(input.scheduled_timezone || APP_TIME_ZONE).trim() || APP_TIME_ZONE,
    created_at: input.created_at || nowIso(),
    updated_at: input.updated_at || nowIso(),
  };
};

const fromPendingAdRow = (row) => ({
  id: row.id,
  advertiser_id: row.advertiser_id || '',
  advertiser_name: row.advertiser_name || '',
  contact_name: row.contact_name || '',
  email: row.email || '',
  phone: normalizeUSPhoneNumber(row.phone || row.phone_number || ''),
  phone_number: normalizeUSPhoneNumber(row.phone_number || row.phone || ''),
  business_name: row.business_name || '',
  ad_name: row.ad_name || '',
  product_id: row.product_id || '',
  product_name: row.product_name || '',
  post_type: normalizePostType(row.post_type),
  post_date: toDateOnly(row.post_date || row.post_date_from),
  post_date_from: toDateOnly(row.post_date_from || row.post_date),
  post_date_to: toDateOnly(row.post_date_to),
  custom_dates: normalizeCustomDateEntries(row.custom_dates),
  post_time: toTimeOnly(row.post_time),
  reminder_minutes: Number(row.reminder_minutes) || 15,
  ad_text: row.ad_text || '',
  media: toArray(row.media),
  placement: row.placement || '',
  price: toMoney(row.price),
  notes: row.notes || '',
  review_notes: row.review_notes || '',
  status: row.status || 'pending',
  viewed_by_admin: Boolean(row.viewed_by_admin),
  rejected_at: row.rejected_at || null,
  series_id: row.series_id || null,
  series_index: Number.isFinite(Number(row.series_index)) ? Number(row.series_index) : null,
  series_total: Number.isFinite(Number(row.series_total)) ? Number(row.series_total) : null,
  series_week_start: toDateOnly(row.series_week_start),
  created_at: row.created_at || nowIso(),
  updated_at: row.updated_at || nowIso(),
});

const toPendingAdRow = (input) => ({
  id: input.id || createId(),
  advertiser_id: input.advertiser_id || null,
  advertiser_name: String(input.advertiser_name || '').trim(),
  contact_name: String(input.contact_name || '').trim(),
  email: String(input.email || '').trim(),
  phone: normalizeUSPhoneNumber(input.phone || input.phone_number || ''),
  phone_number: normalizeUSPhoneNumber(input.phone_number || input.phone || ''),
  business_name: String(input.business_name || '').trim(),
  ad_name: String(input.ad_name || '').trim(),
  product_id: input.product_id || null,
  product_name: String(input.product_name || '').trim(),
  post_type: normalizePostType(input.post_type),
  post_date: toDateColumn(input.post_date || input.post_date_from),
  post_date_from: toDateColumn(input.post_date_from || input.post_date),
  post_date_to: toDateColumn(input.post_date_to),
  custom_dates: normalizeCustomDateEntries(input.custom_dates),
  post_time: toTimeColumn(input.post_time),
  reminder_minutes: Number(input.reminder_minutes) || 15,
  ad_text: String(input.ad_text || '').trim(),
  media: toArray(input.media),
  placement: String(input.placement || '').trim(),
  price: toMoney(input.price),
  notes: String(input.notes || '').trim(),
  review_notes: String(input.review_notes || '').trim() || null,
  status: input.status || 'pending',
  rejected_at: input.rejected_at || null,
  series_id: input.series_id || null,
  series_index:
    Number.isFinite(Number(input.series_index)) && Number(input.series_index) > 0
      ? Number(input.series_index)
      : null,
  series_total:
    Number.isFinite(Number(input.series_total)) && Number(input.series_total) > 0
      ? Number(input.series_total)
      : null,
  series_week_start: toDateColumn(input.series_week_start),
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const fromInvoiceRow = (row) => {
  const items = toArray(row.items).map((item) => ({
    id: item.id || createId(),
    invoice_id: item.invoice_id || row.id,
    ad_id: item.ad_id || null,
    product_id: item.product_id || null,
    description: item.description || '',
    quantity: Number(item.quantity) || 1,
    unit_price: toMoney(item.unit_price),
    amount: toMoney(item.amount),
    created_at: item.created_at || row.created_at || nowIso(),
  }));
  const explicitAdIds = toArray(row.ad_ids).map((id) => normalizeId(id)).filter(Boolean);
  const itemAdIds = items.map((item) => normalizeId(item.ad_id)).filter(Boolean);
  const adIds = explicitAdIds.length > 0 ? explicitAdIds : [...new Set(itemAdIds)];

  return {
    id: row.id,
    invoice_number: row.invoice_number || '',
    advertiser_id: row.advertiser_id || '',
    advertiser_name: row.advertiser_name || '',
    amount: toMoney(row.amount),
    due_date: toDateOnly(row.due_date),
    status: row.status || 'Unpaid',
    paid_date: toDateOnly(row.paid_date),
    ad_ids: adIds,
    items,
    contact_name: row.contact_name || '',
    contact_email: row.contact_email || '',
    bill_to: row.bill_to || '',
    issue_date: toDateOnly(row.issue_date),
    discount: toMoney(row.discount),
    tax: toMoney(row.tax),
    total: toMoney(row.total),
    notes: row.notes || '',
    amount_paid: toMoney(row.amount_paid),
    paid_via_credits: Boolean(row.paid_via_credits),
    payment_provider: row.payment_provider || '',
    payment_reference: row.payment_reference || '',
    payment_note: row.payment_note || '',
    deleted_at: row.deleted_at || null,
    is_recurring: Boolean(row.is_recurring),
    recurring_period: row.recurring_period || '',
    last_generated_at: row.last_generated_at || null,
    created_at: row.created_at || nowIso(),
    updated_at: row.updated_at || nowIso(),
  };
};

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
  contact_name: String(input.contact_name || '').trim(),
  contact_email: String(input.contact_email || '').trim(),
  bill_to: String(input.bill_to || '').trim(),
  issue_date: toDateColumn(input.issue_date),
  discount: toMoney(input.discount),
  tax: toMoney(input.tax),
  total: toMoney(input.total ?? input.amount),
  notes: String(input.notes || '').trim(),
  amount_paid: toMoney(input.amount_paid),
  paid_via_credits: Boolean(input.paid_via_credits),
  payment_provider: String(input.payment_provider || '').trim(),
  payment_reference: String(input.payment_reference || '').trim(),
  payment_note: String(input.payment_note || '').trim(),
  deleted_at: input.deleted_at || null,
  is_recurring: Boolean(input.is_recurring),
  recurring_period: String(input.recurring_period || '').trim(),
  last_generated_at: input.last_generated_at || null,
  created_at: input.created_at || nowIso(),
  updated_at: input.updated_at || nowIso(),
});

const toInvoiceItemRow = (invoiceId, item) => {
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  const unitPrice = toMoney(item?.unit_price ?? item?.amount ?? 0);
  const amount = toMoney(item?.amount ?? Number(unitPrice) * quantity);
  return {
    id: item?.id || createId(),
    invoice_id: invoiceId,
    ad_id: item?.ad_id || null,
    product_id: item?.product_id || null,
    description: String(item?.description || '').trim(),
    quantity,
    unit_price: unitPrice,
    amount,
    created_at: item?.created_at || nowIso(),
  };
};

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

const fromNotificationRows = (notificationRow, adminNotificationRow) => {
  const telegramChatIds = toArray(adminNotificationRow?.telegram_chat_ids);
  const whatsappRecipients = normalizeWhatsAppRecipients(
    adminNotificationRow?.whatsapp_recipients,
  );
  const whatsappSettings = normalizeWhatsAppSettings(adminNotificationRow?.whatsapp_settings);
  const hasActiveTelegramChat = telegramChatIds.some(
    (entry) => entry?.is_active !== false && String(entry?.chat_id || '').trim(),
  );

  return {
    email_enabled:
      adminNotificationRow?.email_enabled ?? notificationRow?.email_enabled ?? false,
    sms_enabled: adminNotificationRow?.sms_enabled ?? false,
    telegram_enabled: adminNotificationRow?.telegram_enabled ?? hasActiveTelegramChat,
    reminder_time_value: Number(adminNotificationRow?.reminder_time_value) || 1,
    reminder_time_unit: adminNotificationRow?.reminder_time_unit || 'hours',
    email_address:
      adminNotificationRow?.email_address ||
      notificationRow?.reminder_email ||
      '',
    phone_number: normalizeUSPhoneNumber(adminNotificationRow?.phone_number || ''),
    sound_enabled: adminNotificationRow?.sound_enabled ?? true,
    reminder_email:
      notificationRow?.reminder_email || adminNotificationRow?.email_address || '',
    telegram_chat_ids: telegramChatIds,
    whatsapp_recipients: whatsappRecipients,
    whatsapp_settings: whatsappSettings,
    created_at: notificationRow?.created_at || adminNotificationRow?.created_at || nowIso(),
    updated_at: notificationRow?.updated_at || adminNotificationRow?.updated_at || nowIso(),
  };
};

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
  phone_number: normalizeUSPhoneNumber(input?.phone_number || ''),
  sound_enabled: input?.sound_enabled !== false,
  telegram_chat_ids: toArray(input?.telegram_chat_ids),
  whatsapp_recipients: normalizeWhatsAppRecipients(input?.whatsapp_recipients),
  whatsapp_settings: normalizeWhatsAppSettings(input?.whatsapp_settings),
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

const fetchWithSupabaseSessionAuth = async (input, init = {}) => {
  if (!canUseSupabase()) {
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

  const accessToken = String(session?.access_token || '').trim();
  if (!accessToken) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status !== 401) {
    return response;
  }

  const { data: refreshData } = await supabase.auth.refreshSession();
  const refreshedToken = String(refreshData?.session?.access_token || '').trim();
  if (!refreshedToken || refreshedToken === accessToken) {
    return response;
  }

  const retryHeaders = new Headers(init.headers || {});
  retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);

  return fetch(input, {
    ...init,
    headers: retryHeaders,
  });
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
    invoiceItemRows,
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
    fetchRows(supabase, 'invoice_items', { optional: true, allowPermissionDenied: true }),
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
  const activeInvoiceRows = (invoiceRows || []).filter((row) => !row?.deleted_at);
  const invoiceItemsByInvoiceId = new Map();
  for (const item of invoiceItemRows || []) {
    const list = invoiceItemsByInvoiceId.get(item.invoice_id) || [];
    list.push(item);
    invoiceItemsByInvoiceId.set(item.invoice_id, list);
  }
  return refreshDerivedFields(
    normalizeDb({
      ...baseDb(users),
      users,
      advertisers: advertiserRows.map(fromAdvertiserRow),
      products: productRows.map(fromProductRow),
      ads: adRows.map(fromAdRow),
      pending_ads: pendingRows.map(fromPendingAdRow),
      invoices: activeInvoiceRows.map((row) =>
        fromInvoiceRow({
          ...row,
          items: invoiceItemsByInvoiceId.get(row.id) || [],
        }),
      ),
      admin_settings: fromAdminSettingsRow(adminSettingsRow),
      notification_preferences: notificationPreferences,
      telegram_chat_ids: notificationPreferences.telegram_chat_ids,
      team_members: teamMembers,
    }),
  );
};

const ensureSupabaseDashboardWriteAccess = async (supabase) => {
  const currentUser = await resolveSupabaseSessionUser(supabase);
  if (!currentUser?.id) {
    throw new Error('Please sign in to modify dashboard data.');
  }
  if (!isInternalRole(currentUser.role)) {
    throw new Error('Dashboard write access requires an internal account.');
  }
};

const rowsEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const syncIdTable = async (
  supabase,
  baseName,
  previousRows,
  nextRows,
  {
    optional = false,
    deleteMode = 'hard',
    skipDeleteIds = [],
  } = {},
) => {
  const table = tableName(baseName);
  const knownUnsupportedColumns = [...getKnownUnsupportedColumns(table)];
  const previousById = new Map(
    toArray(previousRows)
      .filter((row) => row && row.id)
      .map((row) => [String(row.id), row]),
  );
  const nextById = new Map(
    toArray(nextRows)
      .filter((row) => row && row.id)
      .map((row) => [String(row.id), row]),
  );

  const upsertRows = [];
  for (const [id, row] of nextById.entries()) {
    const previousRow = previousById.get(id);
    if (!previousRow || !rowsEqual(previousRow, row)) {
      upsertRows.push(row);
    }
  }

  if (upsertRows.length > 0) {
    let sanitizedUpsertRows = stripUnsupportedColumns(upsertRows, knownUnsupportedColumns);
    let upsertResult = await supabase.from(table).upsert(sanitizedUpsertRows, { onConflict: 'id' });
    let retryCount = 0;
    while (upsertResult.error && isMissingColumnError(upsertResult.error) && retryCount < 8) {
      const missingColumns = extractMissingColumnsFromError(upsertResult.error);
      if (missingColumns.length === 0) {
        break;
      }

      rememberUnsupportedColumns(table, missingColumns);
      sanitizedUpsertRows = stripUnsupportedColumns(sanitizedUpsertRows, missingColumns);
      upsertResult = await supabase.from(table).upsert(sanitizedUpsertRows, {
        onConflict: 'id',
      });
      retryCount += 1;
    }

    if (upsertResult.error) {
      if (optional && isOptionalSyncError(upsertResult.error)) {
        return;
      }
      throwIfSupabaseError(`upsert ${baseName}`, upsertResult.error);
    }
  }

  const skipDeleteIdSet = new Set(toArray(skipDeleteIds).map((id) => String(id)));
  const deleteIds = [...previousById.keys()].filter(
    (id) => !nextById.has(id) && !skipDeleteIdSet.has(id),
  );

  if (deleteIds.length === 0) {
    return;
  }

  const deleteResult =
    deleteMode === 'soft'
      ? await supabase
        .from(table)
        .update({ deleted_at: nowIso(), updated_at: nowIso() })
        .in('id', deleteIds)
      : await supabase.from(table).delete().in('id', deleteIds);
  if (deleteResult.error) {
    if (optional && isOptionalSyncError(deleteResult.error)) {
      return;
    }
    throwIfSupabaseError(`delete ${baseName}`, deleteResult.error);
  }
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
    if (optional && isOptionalSyncError(existing.error)) {
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
      if (fallbackInsert.error) {
        if (optional && isOptionalSyncError(fallbackInsert.error)) {
          return;
        }
        throwIfSupabaseError(`insert singleton ${baseName}`, fallbackInsert.error);
      }
      return;
    }
    if (optional && isOptionalSyncError(insertResult.error)) {
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
    if (fallbackUpdate.error) {
      if (optional && isOptionalSyncError(fallbackUpdate.error)) {
        return;
      }
      throwIfSupabaseError(`update singleton ${baseName}`, fallbackUpdate.error);
    }
    return;
  }
  if (optional && isOptionalSyncError(updateResult.error)) {
    return;
  }
  throwIfSupabaseError(`update singleton ${baseName}`, updateResult.error);
};

const syncAdminNotificationPreferencesViaApi = async (
  row,
  { optional = false } = {},
) => {
  if (!isBrowser() || typeof fetch !== 'function') {
    return;
  }

  let response;
  try {
    response = await fetchWithSupabaseSessionAuth('/api/admin/notification-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    });
  } catch (error) {
    if (optional) {
      return;
    }
    throw new Error(
      `sync admin_notification_preferences via API failed: ${error?.message || 'Network error'}`,
    );
  }

  if (response.ok) {
    return;
  }

  let message = '';
  try {
    const payload = await response.json();
    message = String(payload?.error || '').trim();
  } catch {
    // Ignore JSON parse errors and use status text below.
  }

  if (optional) {
    return;
  }

  throw new Error(
    `sync admin_notification_preferences via API failed (${response.status}): ${message || response.statusText || 'Unknown error'}`,
  );
};

const persistDbToSupabase = async (previousValue, value) => {
  const previousDb = refreshDerivedFields(normalizeDb(previousValue));
  const db = refreshDerivedFields(normalizeDb(value));
  const supabase = getSupabaseClient();
  await ensureSupabaseDashboardWriteAccess(supabase);
  const previousAdvertiserRows = previousDb.advertisers.map(toAdvertiserRow);
  const previousProductRows = previousDb.products.map(toProductRow);
  const previousTeamMemberRows = previousDb.team_members.map(toTeamMemberRow);
  const previousPendingRows = previousDb.pending_ads.map(toPendingAdRow);
  const previousInvoiceRows = previousDb.invoices.map(toInvoiceRow);
  const previousAdRows = previousDb.ads.map(toAdRow);
  const previousInvoiceItemRows = previousDb.invoices.flatMap((invoice) =>
    toArray(invoice.items).map((item) => toInvoiceItemRow(invoice.id, item)),
  );

  const advertiserRows = db.advertisers.map(toAdvertiserRow);
  const productRows = db.products.map(toProductRow);
  const teamMemberRows = db.team_members.map(toTeamMemberRow);
  const pendingRows = db.pending_ads.map(toPendingAdRow);
  const invoiceRows = db.invoices.map(toInvoiceRow);
  const adRows = db.ads.map(toAdRow);
  const invoiceItemRows = db.invoices.flatMap((invoice) =>
    toArray(invoice.items).map((item) => toInvoiceItemRow(invoice.id, item)),
  );
  const removedInvoiceIdSet = new Set(
    previousInvoiceRows
      .map((row) => String(row?.id || ''))
      .filter(Boolean)
      .filter((id) => !invoiceRows.some((row) => String(row?.id || '') === id)),
  );
  const preservedRemovedInvoiceItemIds = previousInvoiceItemRows
    .filter((item) => removedInvoiceIdSet.has(String(item?.invoice_id || '')))
    .map((item) => item.id);

  await syncIdTable(supabase, 'advertisers', previousAdvertiserRows, advertiserRows);
  await syncIdTable(supabase, 'products', previousProductRows, productRows);
  await syncIdTable(supabase, 'team_members', previousTeamMemberRows, teamMemberRows);
  await syncIdTable(supabase, 'pending_ads', previousPendingRows, pendingRows);
  await syncIdTable(supabase, 'invoices', previousInvoiceRows, invoiceRows, {
    deleteMode: 'soft',
  });
  await syncIdTable(supabase, 'ads', previousAdRows, adRows);
  await syncIdTable(supabase, 'invoice_items', previousInvoiceItemRows, invoiceItemRows, {
    optional: true,
    skipDeleteIds: preservedRemovedInvoiceItemIds,
  });

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
  await syncAdminNotificationPreferencesViaApi(
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
        console.error('[localDb] Failed to load Supabase data; keeping current cache.', error);
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
  const previous = clone(dbCache);
  const normalized = refreshDerivedFields(normalizeDb(value));
  persistLocalUsers(normalized.users);

  if (!canUseSupabase()) {
    throw new Error('Supabase configuration is required to persist app data.');
  }

  await persistDbToSupabase(previous, normalized);
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
    return () => { };
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

export const invalidateDbCache = ({ emit = false } = {}) => {
  hasLoadedInitialState = false;
  ensurePromise = null;
  if (emit) {
    emitDbChanged();
  }
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
    const phone = normalizeUSPhoneNumber(input.phone_number || input.phone || '');
    const normalizedName = String(input.advertiser_name || '').trim();
    const normalizedNameKey = normalizedName.toLowerCase();
    const normalizedEmail = String(input.email || '')
      .trim()
      .toLowerCase();
    const payload = {
      id: input.id || createId('adv'),
      advertiser_name: normalizedName,
      contact_name: (input.contact_name || '').trim(),
      email: normalizedEmail,
      phone,
      phone_number: phone,
      business_name: (input.business_name || '').trim(),
      status: input.status || 'active',
      ad_spend: toMoney(input.ad_spend ?? input.total_spend),
      total_spend: toMoney(input.total_spend ?? input.ad_spend),
      credits: toMoney(input.credits),
      next_ad_date: toDateOnly(input.next_ad_date),
      created_at: input.created_at || now,
      updated_at: now,
    };

    let index = db.advertisers.findIndex((item) => item.id === payload.id);

    if (index === -1) {
      if (normalizedEmail) {
        index = db.advertisers.findIndex(
          (item) => String(item?.email || '').trim().toLowerCase() === normalizedEmail,
        );
      }

      if (index === -1 && normalizedNameKey) {
        index = db.advertisers.findIndex(
          (item) =>
            String(item?.advertiser_name || '').trim().toLowerCase() === normalizedNameKey,
        );
      }
    }

    if (index === -1) {
      db.advertisers.unshift(payload);
    } else {
      payload.id = db.advertisers[index].id || payload.id;
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
    const hasInvoiceId = Object.prototype.hasOwnProperty.call(input, 'invoice_id');
    const hasPaidViaInvoiceId = Object.prototype.hasOwnProperty.call(
      input,
      'paid_via_invoice_id',
    );
    const normalizedAdvertiserId = normalizeId(input.advertiser_id);
    const normalizedProductId = normalizeId(input.product_id);
    const advertiser = db.advertisers.find((item) => sameId(item.id, normalizedAdvertiserId));
    const product = db.products.find((item) => sameId(item.id, normalizedProductId));
    const postDate = toDateOnly(input.post_date || input.schedule || input.post_date_from);
    const paidViaInvoiceId = input.paid_via_invoice_id || input.invoice_id || null;
    const resolvedPrice = toMoney(input.price || product?.price || 0);
    const payload = {
      id: input.id || createId('ad'),
      ad_name: (input.ad_name || '').trim(),
      advertiser_id: normalizedAdvertiserId || '',
      advertiser: advertiser?.advertiser_name || input.advertiser || '',
      product_id: normalizedProductId || '',
      product_name: product?.product_name || input.product_name || '',
      post_type: normalizePostType(input.post_type || 'one_time'),
      status: input.status || 'Draft',
      payment: input.payment || 'Unpaid',
      post_date: postDate,
      schedule: postDate,
      post_date_from: toDateOnly(input.post_date_from || postDate),
      post_date_to: toDateOnly(input.post_date_to),
      post_time: toTimeOnly(input.post_time),
      custom_dates: normalizeCustomDateEntries(input.custom_dates),
      notes: input.notes || '',
      ad_text: input.ad_text || '',
      media: toArray(input.media),
      media_urls: toArray(input.media_urls),
      placement: input.placement || '',
      reminder_minutes: Number(input.reminder_minutes) || 15,
      price: resolvedPrice,
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

    const index = db.ads.findIndex((item) => sameId(item.id, payload.id));
    if (index === -1) {
      db.ads.unshift(payload);
    } else {
      payload.created_at = db.ads[index].created_at ?? payload.created_at;
      if (!hasInvoiceId && !hasPaidViaInvoiceId) {
        payload.invoice_id = db.ads[index].invoice_id ?? payload.invoice_id;
        payload.paid_via_invoice_id =
          db.ads[index].paid_via_invoice_id ?? payload.paid_via_invoice_id;
      }
      db.ads[index] = { ...db.ads[index], ...payload };
    }
    saved = payload;
    return db;
  });
  return saved;
};

export const deleteAd = async (adId) => {
  const normalizedAdId = normalizeId(adId);
  if (!normalizedAdId) {
    return;
  }

  await updateDb((db) => {
    db.ads = db.ads.filter(
      (item) => !sameId(item?.id, normalizedAdId),
    );
    db.invoices = db.invoices.map((invoice) => {
      const remainingItems = (invoice.items || []).filter(
        (item) => !sameId(item?.ad_id, normalizedAdId),
      );
      const subtotal = remainingItems.reduce((sum, item) => sum + numberOrZero(item?.amount), 0);
      const nextTotal = toMoney(
        subtotal - numberOrZero(invoice.discount) + numberOrZero(invoice.tax),
      );

      return {
        ...invoice,
        ad_ids: (invoice.ad_ids || []).filter(
          (id) => !sameId(id, normalizedAdId),
        ),
        items: remainingItems,
        amount: nextTotal,
        total: nextTotal,
        amount_paid: normalizeText(invoice.status) === 'paid' ? nextTotal : invoice.amount_paid,
        updated_at: nowIso(),
      };
    });
    return db;
  });
};

export const updateAdStatus = async (adId, status) => {
  const normalizedAdId = normalizeId(adId);
  if (!normalizedAdId) {
    return;
  }
  await updateDb((db) => {
    db.ads = db.ads.map((ad) =>
      sameId(ad.id, normalizedAdId) ? { ...ad, status, updated_at: nowIso() } : ad
    );
    return db;
  });
};

export const updateAdPayment = async (adId, payment) => {
  const normalizedAdId = normalizeId(adId);
  if (!normalizedAdId) {
    return;
  }
  await updateDb((db) => {
    db.ads = db.ads.map((ad) =>
      sameId(ad.id, normalizedAdId) ? { ...ad, payment, updated_at: nowIso() } : ad
    );
    return db;
  });
};

export const submitPendingAd = async (input) => {
  let saved = null;
  await updateDb((db) => {
    const postDateFrom = input.post_date_from || input.post_date || '';
    const postDateTo = input.post_date_to || '';
    const customDates = normalizeCustomDateEntries(input.custom_dates);
    const phone = normalizeUSPhoneNumber(input.phone || input.phone_number || '');
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
      post_date: toDateOnly(input.post_date || postDateFrom || firstCustomDateKey(customDates)),
      post_date_from: toDateOnly(postDateFrom),
      post_date_to: toDateOnly(postDateTo),
      custom_dates: customDates,
      post_time: toTimeOnly(input.post_time),
      reminder_minutes: Number(input.reminder_minutes) || 15,
      ad_text: input.ad_text || '',
      media: Array.isArray(input.media) ? input.media : [],
      placement: input.placement || '',
      notes: input.notes || '',
      review_notes: String(input.review_notes || '').trim(),
      status: 'pending',
      series_id: input.series_id || null,
      series_index:
        Number.isFinite(Number(input.series_index)) && Number(input.series_index) > 0
          ? Number(input.series_index)
          : null,
      series_total:
        Number.isFinite(Number(input.series_total)) && Number(input.series_total) > 0
          ? Number(input.series_total)
          : null,
      series_week_start: toDateOnly(input.series_week_start),
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
    const normalizedStatus = normalizeText(pending?.status);
    if (!pending || !['pending', 'not_approved'].includes(normalizedStatus)) {
      return db;
    }

    const postDate =
      pending.post_date ||
      pending.post_date_from ||
      firstCustomDateKey(pending.custom_dates) ||
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
        phone: normalizeUSPhoneNumber(pending.phone || pending.phone_number || ''),
        phone_number: normalizeUSPhoneNumber(pending.phone_number || pending.phone || ''),
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

    const now = nowIso();
    const adId = createId('ad');
    const invoiceId = createId('inv');
    const invoiceNumber = nextLocalInvoiceNumber(db);
    const pendingProductId = normalizeId(pending.product_id);
    let resolvedProduct = pendingProductId
      ? db.products.find((item) => sameId(item.id, pendingProductId))
      : null;

    if (!resolvedProduct) {
      const normalizedPlacement = String(pending.placement || '').trim().toLowerCase();
      if (normalizedPlacement) {
        resolvedProduct =
          db.products.find(
            (item) => String(item.placement || '').trim().toLowerCase() === normalizedPlacement,
          ) || null;
      }
    }

    const nextAd = {
      id: adId,
      ad_name: pending.ad_name || 'Submitted ad',
      advertiser_id: advertiser.id,
      advertiser: advertiser.advertiser_name,
      product_id: resolvedProduct?.id || pendingProductId || '',
      product_name: resolvedProduct?.product_name || pending.product_name || '',
      post_type: normalizePostType(pending.post_type || 'one_time'),
      status: 'Draft',
      payment: 'Pending',
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
      series_id: pending.series_id || null,
      series_index:
        Number.isFinite(Number(pending.series_index)) && Number(pending.series_index) > 0
          ? Number(pending.series_index)
          : null,
      series_total:
        Number.isFinite(Number(pending.series_total)) && Number(pending.series_total) > 0
          ? Number(pending.series_total)
          : null,
      series_week_start: toDateOnly(pending.series_week_start),
      price: toMoney(pending.price || resolvedProduct?.price || 0),
      media_urls: [],
      invoice_id: invoiceId,
      paid_via_invoice_id: invoiceId,
      created_at: now,
      updated_at: now,
    };

    const invoiceItems = buildDerivedInvoiceItemsForAd({
      adItem: nextAd,
      invoiceId,
      now,
    });
    const invoiceLineAmount = toMoney(
      invoiceItems.reduce((sum, item) => sum + numberOrZero(item.amount), 0),
    );
    db.ads.unshift(nextAd);
    db.invoices.unshift({
      id: invoiceId,
      invoice_number: invoiceNumber,
      advertiser_id: advertiser.id,
      advertiser_name: advertiser.advertiser_name,
      amount: invoiceLineAmount,
      due_date: '',
      status: 'Pending',
      paid_date: '',
      ad_ids: [adId],
      items: invoiceItems,
      contact_name: pending.contact_name || '',
      contact_email: pending.email || '',
      bill_to: pending.advertiser_name || advertiser.advertiser_name || '',
      issue_date: getTodayInAppTimeZone(),
      discount: '0.00',
      tax: '0.00',
      total: invoiceLineAmount,
      notes: 'Auto-generated on ad approval.',
      amount_paid: '0.00',
      created_at: now,
      updated_at: now,
    });

    db.pending_ads = db.pending_ads.filter((item) => item.id !== pendingAdId);
    return db;
  });
};

export const rejectPendingAd = async (pendingAdId, { reasons = [], note = '' } = {}) => {
  const reviewNotes = buildSubmissionReviewNotes({ reasons, note });
  await updateDb((db) => {
    db.pending_ads = db.pending_ads.map((item) =>
      item.id === pendingAdId
        ? {
          ...item,
          status: 'not_approved',
          rejected_at: nowIso(),
          review_notes: reviewNotes || String(item.review_notes || '').trim(),
          updated_at: nowIso(),
        }
        : item
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
  const normalizedInvoiceId = normalizeId(invoiceId);
  const previous = new Set(toArray(previousAdIds).map((id) => normalizeId(id)).filter(Boolean));
  const next = new Set(toArray(nextAdIds).map((id) => normalizeId(id)).filter(Boolean));
  const nextPaymentStatus =
    normalizeText(invoiceStatus) === 'paid' ? 'Paid' : 'Pending';

  db.ads = db.ads.map((ad) => {
    const normalizedAdId = normalizeId(ad?.id);
    if (next.has(normalizedAdId)) {
      return {
        ...ad,
        invoice_id: normalizedInvoiceId,
        paid_via_invoice_id: normalizedInvoiceId,
        payment: nextPaymentStatus,
        updated_at: nowIso(),
      };
    }

    if (previous.has(normalizedAdId) && sameId(ad.invoice_id, normalizedInvoiceId)) {
      return {
        ...ad,
        invoice_id: null,
        paid_via_invoice_id: null,
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
    const invoiceId = normalizeId(input.id) || createId('inv');
    const adIds = Array.from(
      new Set(
        toArray(input.ad_ids)
          .map((adId) => normalizeId(adId))
          .filter(Boolean),
      ),
    );
    const normalizedAdvertiserId = normalizeId(input.advertiser_id);
    const advertiser = db.advertisers.find((item) => sameId(item.id, normalizedAdvertiserId));
    const existing = db.invoices.find((item) => sameId(item.id, invoiceId));
    const previousAdIds = existing?.ad_ids || [];
    const selectedAds = adIds
      .map((adId) => db.ads.find((item) => sameId(item.id, adId)))
      .filter(Boolean);
    const derivedItems = selectedAds.flatMap((adItem) =>
      buildDerivedInvoiceItemsForAd({
        adItem,
        invoiceId,
        existingItems: toArray(existing?.items).filter((item) => sameId(item?.ad_id, adItem.id)),
        now,
      }),
    );
    let items = Array.isArray(input.items) && input.items.length > 0 ? input.items : derivedItems;
    const explicitAmountValue = numberOrZero(input.total ?? input.amount);
    const discount = toMoney(input.discount);
    const tax = toMoney(input.tax);
    if (items.length > 0 && explicitAmountValue > 0) {
      const currentSubtotal = items.reduce(
        (sum, item) => sum + numberOrZero(item.amount ?? item.unit_price),
        0,
      );
      const currentTotal =
        currentSubtotal - numberOrZero(discount) + numberOrZero(tax);
      const targetSubtotal = Math.max(
        0,
        explicitAmountValue + numberOrZero(discount) - numberOrZero(tax),
      );

      if (currentSubtotal <= 0 || Math.abs(currentTotal - explicitAmountValue) > 0.009) {
        items = rebalanceInvoiceItemsToSubtotal(items, targetSubtotal);
      }
    }

    const explicitAmount = toMoney(explicitAmountValue);
    const derivedSubtotal = items.reduce((sum, item) => sum + numberOrZero(item.amount), 0);
    const subtotal = items.length > 0 ? derivedSubtotal : explicitAmount;
    const total = toMoney(subtotal - numberOrZero(discount) + numberOrZero(tax));
    const hasLinkedAds = adIds.length > 0;
    const hasItems = items.length > 0;
    const hasPositiveTotal = numberOrZero(total) > 0;

    if (!hasLinkedAds && !hasItems && !hasPositiveTotal) {
      throw new Error("Invoice requires linked ads, line items, or a positive amount.");
    }

    const status = input.status || 'Unpaid';
    const normalizedStatus = normalizeText(status);
    if (existing?.paid_via_credits && normalizedStatus !== 'paid') {
      throw new Error('Credit-paid invoices must remain marked as Paid.');
    }
    const paidViaCredits =
      input.paid_via_credits !== undefined
        ? Boolean(input.paid_via_credits)
        : Boolean(existing?.paid_via_credits);
    const isPaidStatus = normalizedStatus === 'paid';
    const isPartialStatus = normalizedStatus === 'partial';
    const shouldCapturePaymentMetadata = !paidViaCredits && (isPaidStatus || isPartialStatus);
    const paymentProvider = shouldCapturePaymentMetadata
      ? normalizeInvoicePaymentProvider(
          input.payment_provider ?? existing?.payment_provider ?? '',
        )
      : '';
    const paymentReference = shouldCapturePaymentMetadata
      ? String(input.payment_reference ?? existing?.payment_reference ?? '').trim()
      : '';
    const paymentNote = shouldCapturePaymentMetadata
      ? String(input.payment_note ?? existing?.payment_note ?? '').trim()
      : '';
    const amountPaid = isPaidStatus
      ? total
      : isPartialStatus
        ? toMoney(input.amount_paid ?? existing?.amount_paid)
        : '0.00';

    if (shouldCapturePaymentMetadata) {
      if (!paymentProvider) {
        throw new Error('Paid or partial invoices require a payment provider.');
      }
      if (
        invoicePaymentProviderRequiresReference(paymentProvider) &&
        !paymentReference
      ) {
        throw new Error('This payment provider requires a transaction or reference number.');
      }
      if (invoicePaymentProviderRequiresNote(paymentProvider) && !paymentNote) {
        throw new Error('Other payment methods require a payment note.');
      }
    }

    if (isPartialStatus) {
      const partialAmount = numberOrZero(amountPaid);
      if (!(partialAmount > 0 && partialAmount < numberOrZero(total))) {
        throw new Error('Partial invoices require an amount paid greater than 0 and less than the total.');
      }
    }

    const payload = {
      id: invoiceId,
      invoice_number:
        existing?.invoice_number ||
        (input.invoice_number || '').trim() ||
        nextLocalInvoiceNumber(db, { dateValue: input.issue_date || new Date() }),
      advertiser_id: normalizedAdvertiserId || '',
      advertiser_name: advertiser?.advertiser_name || input.advertiser_name || '',
      amount: total,
      due_date: toDateOnly(input.due_date),
      status,
      paid_date:
        shouldCapturePaymentMetadata
          ? toDateOnly(input.paid_date || existing?.paid_date || now.slice(0, 10))
          : '',
      ad_ids: adIds,
      items: items.map((item) => ({
        ...item,
        id: item.id || createId('inv_item'),
        invoice_id: invoiceId,
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: toMoney(item.unit_price ?? item.amount),
        amount: toMoney(item.amount ?? item.unit_price),
      })),
      contact_name: input.contact_name || advertiser?.contact_name || '',
      contact_email: input.contact_email || advertiser?.email || '',
      bill_to: input.bill_to || advertiser?.advertiser_name || input.advertiser_name || '',
      issue_date: getTodayInAppTimeZone(),
      discount,
      tax,
      total,
      notes: String(input.notes || '').trim(),
      amount_paid: amountPaid,
      paid_via_credits: paidViaCredits,
      payment_provider: paymentProvider,
      payment_reference: paymentReference,
      payment_note: paymentNote,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    const index = db.invoices.findIndex((item) => sameId(item.id, invoiceId));
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
  const normalizedInvoiceId = normalizeId(invoiceId);
  if (!normalizedInvoiceId) {
    return;
  }

  await updateDb((db) => {
    const invoice = db.invoices.find((item) => sameId(item.id, normalizedInvoiceId));
    if (!invoice) {
      return db;
    }

    if (invoice.paid_via_credits && invoice.advertiser_id) {
      const creditRefund = numberOrZero(invoice.total ?? invoice.amount ?? invoice.amount_paid);
      if (creditRefund > 0) {
        db.advertisers = db.advertisers.map((advertiser) =>
          sameId(advertiser.id, invoice.advertiser_id)
            ? {
              ...advertiser,
              credits: toMoney(numberOrZero(advertiser.credits) + creditRefund),
              updated_at: nowIso(),
            }
            : advertiser,
        );
      }
    }

    const linkedAdIds = invoice?.ad_ids || [];
    db.invoices = db.invoices.filter((item) => !sameId(item.id, normalizedInvoiceId));
    applyInvoiceLinks(db, normalizedInvoiceId, linkedAdIds, [], 'Unpaid');
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
        const ad = db.ads.find((item) => sameId(item.id, adId));
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
