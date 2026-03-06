# CBN Ads Agent Handbook

Last updated: March 6, 2026

## Scope

This handbook documents the current engineering context for:

- Repo: `c:\Users\user\Documents\cbn ads`
- App: `anything/apps/web`

It also defines reusable personas/skills for:

- UX/UI audit
- Frontend audit
- Backend audit
- Debugging workflow

## Critical Safety Rule (Production Data)

Production/live website data is now real customer/business data.

Non-negotiable rule for all future work:

1. Do not delete, truncate, reset, purge, or hard-overwrite production/live data.
2. Do not run destructive SQL (`DELETE`, `TRUNCATE`, `DROP`, destructive `UPDATE`) against live data by default.
3. Any destructive data change requires explicit written approval from the user in the current task before execution.
4. Default approach must be additive and reversible (safe migrations, backups, soft-delete, or no-op when uncertain).

## Current Product State

### Admin app sections

Primary admin UI is consolidated in:

- `anything/apps/web/src/app/ads/page.jsx`

Sections currently present:

1. Dashboard
2. Calendar
3. Submissions
4. Advertisers
5. Ads
6. Products
7. Billing
8. Reconciliation
9. Settings

Recent design parity work is reflected in commits:

- `11a23c4` to `7e7d9c2` on `main`

### Authentication and local fallback accounts

Local auth helpers:

- `anything/apps/web/src/lib/localAuth.js`
- `anything/apps/web/src/lib/localDb.js`

Required local users seeded:

1. Admin
   - Email: `zach@cbnads.com`
   - Password: `admin123!`
   - Role: `admin`
2. Advertiser
   - Email: `ads@cbn.com`
   - Password: `ads123!`
   - Role: `advertiser`

Legacy test login (`admin@cbnads.local`) is filtered out.

## Backend Architecture

### Runtime model

- Frontend + API routes in React Router app.
- API route files under:
  - `anything/apps/web/src/app/api`
- Data layer:
  - Supabase namespaced tables via `supabase-db` helper.
  - Local storage DB still used for dashboard/local mode UX (`localDb`) in parts of app.

### Supabase namespace isolation

Namespace helpers:

- `anything/apps/web/src/lib/appNamespace.js`
- `anything/apps/web/src/lib/supabase.js`
- `anything/apps/web/src/lib/supabaseAdmin.js`

Expected namespace:

- `VITE_APP_DATA_NAMESPACE=cbnads_web`
- Table prefix example: `cbnads_web_ads`

### Migrations and schema files

Key migrations:

- `anything/apps/web/supabase/migrations/20260226135827_init_cbnads_web_schema.sql`
- `anything/apps/web/supabase/migrations/20260226141504_extend_cbnads_web_schema_client_parity.sql`

Setup doc:

- `anything/apps/web/SUPABASE_SETUP.md`

### API helper status

Primary helpers:

- `anything/apps/web/src/app/api/utils/supabase-db.js`
- `anything/apps/web/src/app/api/utils/invoice-helpers.js`
- `anything/apps/web/src/app/api/utils/auth-check.js`

No active API imports should point to old SQL helper patterns for route logic. Verify with:

```powershell
rg -n "utils/sql" anything/apps/web/src/app/api
```

## Roles Model

### App-level roles currently in use

1. `admin`
   - full admin routes/actions
2. `advertiser`
   - restricted dashboard access paths
3. `user` (fallback in server auth resolution)
   - returned when role cannot be resolved from session/team mapping

### Where roles are resolved

- `anything/apps/web/src/app/api/utils/auth-check.js`
  - Checks session user role first.
  - Falls back to namespaced `team_members.role` lookup by email.
  - `requireAdmin()` enforces `role === "admin"`.

## Environment and Commands

### Environment files

- `anything/apps/web/.env.local`
- `anything/apps/web/.env.example`

Core vars:

1. `VITE_APP_DATA_NAMESPACE`
2. `VITE_SUPABASE_URL`
3. `VITE_SUPABASE_ANON_KEY`
4. `SUPABASE_URL`
5. `SUPABASE_SERVICE_ROLE_KEY`

### Common commands

From `anything/apps/web`:

```powershell
npm run dev
npm run build
npm run typecheck
```

### Deploy notes

- `vercel.json` present in app root.
- If CLI auth fails, re-authenticate:

```powershell
npx vercel login
npx vercel --prod --yes
```

## Known Operational Notes

1. Supabase migration history can drift from remote state.
2. If API/runtime fields mismatch schema, validate compatibility columns in remote DB.
3. Keep namespace isolation consistent across:
   - table names
   - local storage keys
   - future storage buckets

## Recent Fixes (March 5, 2026)

1. Destructive actions in Ads UI now use app toasts (no browser `window.confirm` dialogs):
   - batch ad delete
   - WhatsApp message delete
   - team member remove
   - Telegram chat ID delete
2. Batch ad delete must use authenticated fetch helper (`fetchWithSessionAuth`) to avoid `401 Unauthorized` in `/api/ads/bulk-action`.
3. Local dev HMR stability:
   - service worker is disabled/unregistered on localhost
   - dev service worker excludes Vite/HMR paths (`/@vite/`, `/@id/`, `/src/`, `/node_modules/`)
4. Submission notifications are now faster and cross-tab aware:
   - unread polling interval reduced to 10 seconds
   - public submit flow emits `cbn:pending-submission-created` (custom event + localStorage ping)
   - notification hook listens for that signal and refreshes unread count immediately
   - admin unread/mark-read endpoints now accept both `pending` and `Pending` status values
5. Important behavior rule:
   - bell/Submissions badges and Submissions toast track only real **pending submissions** (`pending_ads` via `/submit-ad`)
   - admin "Create new ad" in Ads section must not increment Submissions unread/badge/toast
   - admin-created ads emit local source `admin-created-ad` and must appear under Ads notification pathways (Ads sidebar badge + bell item navigating to Ads)
6. Submissions review workflow is locked:
   - clicking the eye action in **Submissions** must open the submission review modal (not a toast-only preview)
   - review modal must allow editing submission fields so admins can apply client-requested changes
   - admin actions must be available in the same review modal:
     - `pending`: Approve and Reject
     - `not_approved`: Delete
   - do not convert this modal into read-only review mode
7. Email notification and invoice rules (critical):
   - Submitted ad flow (`/api/public/submit-ad`) sends:
     - advertiser confirmation email
     - internal notifications to admin/manager/staff (and owner), resolved from `team_members` + `profiles` + enabled notification preference emails
   - Admin-created ad flow sends:
     - advertiser account invite flow via `/api/admin/advertisers/ensure-account`:
       - create/update advertiser auth user as role `Advertiser`
       - send verification email only when account is not already verified
       - existing verified advertiser must not receive duplicate verification email
     - approved ad/payment instruction email via `/api/admin/ads/send-approval-email`
     - internal notification email for the created/approved ad to admin/manager/staff (and owner)
   - Approval email invoice safety:
     - `send-approval-email` must not send `Pending assignment` when an invoice exists or can be inferred
     - resolve invoice using (in order):
       1. ad-linked ids (`paid_via_invoice_id`, `invoice_id`, request `invoice_id`)
       2. `invoice_items` by `ad_id`
       3. `invoices.ad_ids` containing the ad
     - if no invoice is found, auto-create and link invoice before sending email
     - billing "continue" UI should reuse invoice returned by approval-email API to avoid duplicate invoice creation

## Audit and Debug Personas

Skills live in:

- `skills/ux-ui-audit`
- `skills/frontend-audit`
- `skills/backend-audit`
- `skills/debugger-workflow`

### Persona: UX/UI Auditor

Use when:

- requesting 1:1 design parity
- validating spacing/typography/alignment
- checking responsive behavior and UX friction

Skill:

- `skills/ux-ui-audit`

### Persona: Frontend Auditor

Use when:

- reviewing component architecture and state management
- diagnosing rendering/performance regressions
- validating client-side behavior against requirements

Skill:

- `skills/frontend-audit`

### Persona: Backend Auditor

Use when:

- validating API contract correctness
- checking auth/role enforcement
- auditing Supabase schema alignment and data integrity

Skill:

- `skills/backend-audit`

### Persona: Debugger

Use when:

- bug is reproducible but root cause is unknown
- regression must be bisected quickly
- need a reproducible, evidence-first debugging trail

Skill:

- `skills/debugger-workflow`

## Suggested Audit Order for This App

1. UX/UI parity pass (`ux-ui-audit`)
2. Frontend code quality and behavior pass (`frontend-audit`)
3. Backend/API and schema pass (`backend-audit`)
4. Focused issue isolation and fix verification (`debugger-workflow`)
