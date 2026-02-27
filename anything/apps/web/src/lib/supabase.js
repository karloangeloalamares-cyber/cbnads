import { createClient } from '@supabase/supabase-js';
import { APP_DATA_NAMESPACE, withNamespaceUnderscore } from '@/lib/appNamespace';

const runtimeEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const processEnv = typeof process !== 'undefined' ? process.env || {} : {};

const readEnv = (...keys) => {
  for (const key of keys) {
    const runtimeValue = runtimeEnv[key];
    if (runtimeValue) {
      return runtimeValue;
    }
    const processValue = processEnv[key];
    if (processValue) {
      return processValue;
    }
  }
  return '';
};

const SUPABASE_URL =
  readEnv('NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_URL');

const SUPABASE_ANON_KEY =
  readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

let cachedClient = null;

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const getSupabaseClient = () => {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.',
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
