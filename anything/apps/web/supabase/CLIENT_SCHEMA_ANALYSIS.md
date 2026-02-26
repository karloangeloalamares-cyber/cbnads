# Client SQL Schema Analysis (Reference for Supabase Migration)

Last updated: 2026-02-26

## 1) Executive Summary

The client SQL dump models a complete ad operations system:

- intake (`pending_ads`)
- scheduling and publishing (`ads`)
- CRM (`advertisers`, `products`)
- billing (`invoices`, `invoice_items`)
- reminders and notification preferences (`sent_reminders`, `admin_notification_preferences`)
- custom auth/session tables (`auth_*`)

The dump is relational and production-oriented (PKs, FKs, indexes, unique constraints), but has a few integrity gaps and no RLS policy definitions.

## 2) Non-Business SQL in the Dump

These statements are environment/session setup and not business logic:

- `SET ...` statements (`statement_timeout`, `search_path`, etc.)
- table/sequence owner assignments (`OWNER TO neondb_owner`)
- default privileges for roles at the end

For Supabase migration, keep table/index/constraint DDL; owner/role statements are usually adjusted or skipped.

## 3) Domain Model by Table

| Table | Purpose | Important Columns | Notes |
| --- | --- | --- | --- |
| `admin_settings` | Global ad scheduling rule | `max_ads_per_day` | Usually a singleton row used for capacity checks. |
| `admin_notification_preferences` | Per-admin notification settings | `user_id` (unique), `email_enabled`, `sms_enabled`, `reminder_time_value`, `reminder_time_unit`, `sound_enabled` | 1:1 with `auth_users` via unique `user_id`. |
| `ads` | Main ad records for scheduling/publishing/payment tracking | `ad_name`, `advertiser`, `status`, `post_type`, `placement`, date/time fields, `payment`, `published_at`, `archived`, `paid_via_invoice_id`, `published_dates` | Core table. Supports single date, range, and custom dates. |
| `pending_ads` | Public submission queue before admin approval | advertiser/contact fields, `status`, schedule fields, `viewed_by_admin`, `rejected_at` | Feeds approved ads workflow. |
| `advertisers` | Advertiser master data | `advertiser_name`, `contact_name`, `email`, `phone_number`, `total_spend`, `next_ad_date`, `status` | Referenced by invoices. |
| `products` | Product/package catalog | `product_name`, `placement`, `price` | Referenced by invoice items. |
| `invoices` | Invoice headers | `invoice_number` (unique), `advertiser_id`, issue/status/totals, recurring fields | Supports soft delete (`deleted_at`) and recurring metadata. |
| `invoice_items` | Invoice line items | `invoice_id`, `ad_id`, `product_id`, qty/price/amount | Flexible: line can reference ad/product or be manual description-only. |
| `sent_reminders` | Log of reminder sends | `ad_id`, `sent_at`, `reminder_type`, `recipient_type` | Useful for dedupe and audit. |
| `auth_users` | User profile/role store | `name`, `email`, `image`, `role` | Base identity table for app access. |
| `auth_accounts` | External/provider account links | `userId`, `provider`, `providerAccountId`, tokens | NextAuth-style account links. |
| `auth_sessions` | Session tokens | `userId`, `sessionToken`, `expires` | NextAuth-style session persistence. |
| `auth_verification_token` | One-time verification tokens | `identifier`, `token`, `expires` | Primary key on (`identifier`, `token`). |

## 4) Relationship Map

Primary FK graph in the dump:

- `auth_users` 1:N `auth_accounts`
- `auth_users` 1:N `auth_sessions`
- `auth_users` 1:1 `admin_notification_preferences`
- `advertisers` 1:N `invoices`
- `invoices` 1:N `invoice_items`
- `ads` 1:N `invoice_items`
- `products` 1:N `invoice_items`
- `invoices` 1:N `ads` via `ads.paid_via_invoice_id`
- `ads` 1:N `sent_reminders`

## 5) Constraints and Indexes (Behavior Impact)

### Key constraints

- PKs on all business tables.
- Uniques:
  - `admin_notification_preferences(user_id)`
  - `invoices(invoice_number)`
  - composite PK on `auth_verification_token(identifier, token)`
- FK delete behavior is mostly sane:
  - `CASCADE` where child should disappear (`auth_accounts`, `auth_sessions`, `invoice_items` by invoice, `sent_reminders`)
  - `SET NULL` where history should remain (`invoice_items.ad_id/product_id`, `invoices.advertiser_id`, `ads.paid_via_invoice_id`)

### Existing indexes

- `ads`: `paid_via_invoice_id`, `published_dates` (GIN)
- `invoice_items`: `invoice_id`
- `invoices`: `advertiser_id`, `status`
- `pending_ads`: `(viewed_by_admin, status)`
- `sent_reminders`: `ad_id`

## 6) Functional Workflows Encoded by the Schema

### A) Public ad submission -> admin approval

1. Public form writes to `pending_ads`.
2. Admin reviews pending records.
3. Approved request becomes an `ads` row.
4. Rejection can be recorded with `status` + `rejected_at`.

### B) Scheduling and publish tracking

- Supports:
  - one-date (`schedule`/single date style)
  - range (`post_date_from`, `post_date_to`)
  - explicit list (`custom_dates`)
- Publish metadata:
  - `published_at`
  - `published_dates` for multi-date publish history
- Capacity control likely uses `admin_settings.max_ads_per_day`.

### C) Billing and reconciliation

- `invoices` = header totals and status.
- `invoice_items` = detailed lines linked to ad/product when relevant.
- `ads.paid_via_invoice_id` links payment source back to invoice.

### D) Admin reminders and preferences

- Preferences per admin in `admin_notification_preferences`.
- Send log in `sent_reminders` supports traceability and duplicate prevention.

## 7) Integrity and Migration Risks to Address

1. Missing FK on `ads.product_id` (integer exists but no FK to `products.id`).
2. `ads.advertiser` is free text (no `advertiser_id` FK in this dump), so referential consistency is weak.
3. No enum/check constraints for values like `status`, `post_type`, `payment`.
4. No table-level RLS policies are included in the dump.
5. Auth tables do not show common uniqueness constraints (for example `auth_users.email`, `auth_sessions.sessionToken`, `auth_accounts(provider, providerAccountId)`).

## 8) Adaptation for This Repo (Two Apps, No Data Leaks)

Your current repo already isolates data via namespace prefix (`VITE_APP_DATA_NAMESPACE`), for example:

- `cbnads_web_ads`
- `cbnads_web_invoices`
- `cbnads_web_pending_ads`

Recommended approach:

1. Keep prefix strategy for all tables and storage buckets.
2. Apply same prefix to every table from the client schema when importing.
3. Keep auth isolated too if both apps share one Supabase project:
   - either app-prefixed custom auth tables (`cbnads_web_auth_users`, etc.)
   - or separate Supabase Auth projects if strict isolation is required.

## 9) Mapping: Client Schema -> Namespaced Table Names

For app namespace `cbnads_web`:

- `admin_notification_preferences` -> `cbnads_web_admin_notification_preferences`
- `admin_settings` -> `cbnads_web_admin_settings`
- `ads` -> `cbnads_web_ads`
- `advertisers` -> `cbnads_web_advertisers`
- `auth_accounts` -> `cbnads_web_auth_accounts`
- `auth_sessions` -> `cbnads_web_auth_sessions`
- `auth_users` -> `cbnads_web_auth_users`
- `auth_verification_token` -> `cbnads_web_auth_verification_token`
- `invoice_items` -> `cbnads_web_invoice_items`
- `invoices` -> `cbnads_web_invoices`
- `pending_ads` -> `cbnads_web_pending_ads`
- `products` -> `cbnads_web_products`
- `sent_reminders` -> `cbnads_web_sent_reminders`

## 10) Gap vs Current `init.cbnads_web.sql`

Current repo SQL is a simplified subset. Missing from current init script:

- `invoice_items`
- `sent_reminders`
- `auth_*` tables
- several `ads` fields (`published_at`, `archived`, `published_dates`, `paid_via_invoice_id`)
- several `pending_ads` fields (`viewed_by_admin`, `rejected_at`)
- richer notification preference fields (per-user settings)

Current script also has a table not present in the client dump:

- `cbnads_web_team_members`

## 11) Recommended Next Step

Create a second migration script derived from the client dump, but:

- apply namespace prefix to all objects
- switch integer IDs/sequences to UUID only if you intentionally want that change
- add missing integrity constraints (FKs/checks/uniques)
- define RLS policies before exposing tables through `anon` key access

