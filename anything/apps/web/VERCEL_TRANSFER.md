# Vercel Transfer Checklist

This app is ready to move to a new Vercel project. The code builds locally with the current repo state.

## Preferred path: transfer the existing Vercel project

If you still have access to both the old and new Vercel teams/accounts, use Vercel's built-in project transfer flow. Vercel documents this as a zero-downtime move and includes deployments, project settings, Git connection, domains/aliases, cron jobs, and environment variables.

Use this when possible because it is the lowest-risk option.

## Internal transfer limitations: repo-specific assessment

Based on the current repo, Vercel's built-in project transfer should work for this app without needing a rebuild of the project setup.

What should carry over cleanly:

- project configuration details, which should include the existing Vercel project settings
- Git repository link
- domains and aliases
- cron jobs
- project environment variables
- deployments, analytics, and speed insights

What I checked in this repo:

- `anything/apps/web/vercel.json` does not use `env` or `build.env`, so the main documented environment-variable exception does not apply here
- the app defines its deploy behavior in code with `buildCommand`, `outputDirectory`, routes, and cron config
- I found no repo usage of `@vercel/blob` or `@vercel/edge-config`

What still needs manual verification after transfer:

- re-add any Vercel marketplace integrations if the current project uses them
- reconfigure custom log drains if you use them
- confirm domains if your project uses a subdomain or wildcard; Vercel transfers delegated access for those, but the root domain remains on the origin scope
- relink local CLI metadata because `.vercel/project.json` is team-scoped
- if this project relies on team-level Shared Environment Variables instead of only project-level variables, verify those links on the target team

Non-blockers from Vercel's limitations:

- usage counters reset
- Active Branches history is cleared
- monitoring history and old logs do not transfer

## Fresh-project path: create a new Vercel project

If you cannot transfer the existing project directly, create a new project with these settings:

- Root Directory: `anything/apps/web`
- Build Command: `npm run build`
- Output Directory: `build/client`
- Install Command: default `npm install` is fine
- `vercel.json`: already present in `anything/apps/web/vercel.json`

Important: the deployable app is not at the repo root. If Root Directory is left at the repository root, the build will fail.

## Environment variables to copy

Minimum required:

- `VITE_APP_DATA_NAMESPACE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_SECRET`
- `AUTH_URL`
- `DATABASE_URL`
- `APP_URL`

Used by production features when enabled:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `ZAPIER_WEBHOOK_URL`
- `TELEGRAM_BOT_TOKEN`
- `APPROVAL_ZELLE_NUMBER`
- `CRON_SECRET`

Notes:

- This project does not define `env` or `build.env` inside `vercel.json`, so there is no extra `vercel.json` env state to migrate.
- The reminder cron hits `/api/admin/send-reminders` and relies on `CRON_SECRET` if it is being called without a logged-in admin session.

## Settings that matter in this repo

- API traffic is routed through the single Vercel function at `api/index.js`.
- Non-API traffic is served from the built SPA at `build/client`.
- A cron job is configured in `vercel.json` for `/api/admin/send-reminders` on `0 9 * * *`.

## Domain and integration checks

After the new project exists, verify:

- custom domains are attached to the new project
- DNS records still point where expected
- any Vercel marketplace integrations are re-added if the old project used them
- email sender/domain setup still matches the new project/account if you use Resend

## Local relink after the move

The repository is currently linked to an existing Vercel project through:

- `.vercel/project.json`

After the transfer or new-project creation, relink locally from the repository root:

```powershell
npx vercel link
```

To refresh local development variables into the app directory after linking:

```powershell
npx vercel env pull anything/apps/web/.env.local
```

If you want a clean relink, remove the existing `.vercel` folder first and then run `npx vercel link` again.

## Smoke test after cutover

Check these before you treat the move as complete:

- home page loads
- sign-in and reset-password flows resolve to the correct domain
- public submit-ad flow works
- admin pages can read/write data
- email send test works
- telegram verification/send works if used
- `/api/admin/send-reminders` works with the configured cron/auth path

## Useful repo references

- `anything/apps/web/package.json`
- `anything/apps/web/vercel.json`
- `anything/apps/web/.env.example`
- `anything/apps/web/SUPABASE_SETUP.md`
