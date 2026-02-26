const DEFAULT_APP_NAMESPACE = 'cbnads_web';

const runtimeEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const configuredNamespace =
  runtimeEnv.VITE_APP_DATA_NAMESPACE ||
  (typeof process !== 'undefined' ? process.env?.VITE_APP_DATA_NAMESPACE : '') ||
  DEFAULT_APP_NAMESPACE;

const normalizeNamespace = (value) => {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || DEFAULT_APP_NAMESPACE;
};

export const APP_DATA_NAMESPACE = normalizeNamespace(configuredNamespace);

export const withNamespace = (value) => `${APP_DATA_NAMESPACE}.${value}`;

export const withNamespaceUnderscore = (value) =>
  `${APP_DATA_NAMESPACE}_${String(value || '').trim()}`;

