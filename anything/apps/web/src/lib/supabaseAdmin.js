import { createClient } from '@supabase/supabase-js';
import { APP_DATA_NAMESPACE, withNamespaceUnderscore } from '@/lib/appNamespace';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let cachedAdminClient = null;

export const hasSupabaseAdminConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const getSupabaseAdmin = () => {
  if (!hasSupabaseAdminConfig) {
    throw new Error(
      'Supabase admin is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  if (!cachedAdminClient) {
    cachedAdminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedAdminClient;
};

export const adminTableName = (baseName) => withNamespaceUnderscore(baseName);
export const adminBucketName = (baseName) => withNamespaceUnderscore(baseName);
export const supabaseAdminNamespace = APP_DATA_NAMESPACE;

