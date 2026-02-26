import { createClient } from '@supabase/supabase-js';
import { APP_DATA_NAMESPACE, withNamespaceUnderscore } from '@/lib/appNamespace';

const runtimeEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const SUPABASE_URL =
  runtimeEnv.VITE_SUPABASE_URL ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_URL : '');

const SUPABASE_ANON_KEY =
  runtimeEnv.VITE_SUPABASE_ANON_KEY ||
  (typeof process !== 'undefined' ? process.env?.VITE_SUPABASE_ANON_KEY : '');

let cachedClient = null;

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const getSupabaseClient = () => {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return cachedClient;
};

export const tableName = (baseName) => withNamespaceUnderscore(baseName);
export const bucketName = (baseName) => withNamespaceUnderscore(baseName);
export const supabaseNamespace = APP_DATA_NAMESPACE;

