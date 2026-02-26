# Supabase Setup (Isolated by App Namespace)

This app is configured to isolate data using an app namespace.

## 1) Set environment variables

Create `.env` from `.env.example` and set:

- `VITE_APP_DATA_NAMESPACE`:
  - Unique per app in the same Supabase project.
  - Example for this app: `cbnads_web`
  - Example for second app: `cbnads_mobile`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 2) Create namespaced tables

Open Supabase SQL Editor and run the script:

- `supabase/init.cbnads_web.sql`
- `supabase/migrations/20260226141504_extend_cbnads_web_schema_client_parity.sql`

If you use a different namespace, duplicate the script and replace `cbnads_web_` prefix.

No storage bucket is required for current media flow. Uploads use external URL-based media handling.

## 3) Why this prevents leaks

- Table names are prefixed per app (`cbnads_web_ads`, `cbnads_web_invoices`, etc.).
- Storage bucket names should also be prefixed per app (for example `cbnads_web_media`).
- Local browser data keys are also namespaced through `VITE_APP_DATA_NAMESPACE`.

## 4) App helpers already added

- `src/lib/appNamespace.js`
  - `APP_DATA_NAMESPACE`
  - `withNamespace(...)`
  - `withNamespaceUnderscore(...)`
- `src/lib/supabase.js`
  - `getSupabaseClient()`
  - `tableName(baseName)`
  - `bucketName(baseName)`
- `src/lib/supabaseAdmin.js`
  - `getSupabaseAdmin()`
  - `adminTableName(baseName)`
  - `adminBucketName(baseName)`

## 5) Client schema reference

If you are migrating from the client SQL dump, use:

- `supabase/CLIENT_SCHEMA_ANALYSIS.md`

It documents the full table model, relationships, risks, and how to apply namespace isolation.
