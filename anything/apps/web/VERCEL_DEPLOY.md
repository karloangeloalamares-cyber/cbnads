# Vercel Deployment (Web)

## Recommended Project Settings

- Framework Preset: `Other`
- Root Directory: repository root (`.`)
- Install Command: from `vercel.json` (`cd anything/apps/web && npm ci`)
- Build Command: from `vercel.json` (`npm run build:web`)
- Output Directory: from `vercel.json` (`anything/apps/web/build/client`)

This repo also includes `anything/apps/web/vercel.json` for teams that set Vercel Root Directory to `anything/apps/web`.

## Required Environment Variables

None for local-mode deployment.

## Commonly Needed Environment Variables

- `AUTH_SECRET`
- `AUTH_URL`
- `APP_URL`
- `RESEND_API_KEY`
- `ZAPIER_WEBHOOK_URL`
- `CORS_ORIGINS`
- `NEXT_PUBLIC_CREATE_BASE_URL`
- `NEXT_PUBLIC_CREATE_API_BASE_URL`
- `NEXT_PUBLIC_CREATE_HOST`
- `NEXT_PUBLIC_PROJECT_GROUP_ID`
- `NEXT_PUBLIC_BASE_CREATE_USER_CONTENT_URL`

## Local Mode (No Database)

- Database is disabled by default.
- Sign-in falls back to local browser storage.
- This is temporary and intended for staging/testing before Supabase is added.
- In local mode, local users are treated as `admin`.

## Enable Database Later

When you are ready for Supabase:

- Set `CBN_ENABLE_DATABASE=true`
- Set `DATABASE_URL=<your-supabase-postgres-url>`

## Local Verification

From repository root:

```bash
npm run build:web
```

From `anything/apps/web`:

```bash
$env:VERCEL='1'; node -e "import('./api/index.mjs').then(async (m) => { const res = await m.default(new Request('http://localhost/'), {}); console.log(res.status); }).catch((e) => { console.error(e); process.exit(1); })"
```
