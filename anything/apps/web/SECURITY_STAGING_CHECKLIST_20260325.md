# Security Staging Checklist

Date baseline: March 25, 2026  
Release candidate: `3d6e898`  
Purpose: validate advertiser auth hardening, anti-enumeration changes, and private media access before production rollout.

## 1) Prerequisites
- Deploy commit `3d6e898` to staging first.
- Confirm staging points to the correct app domain.
- Confirm these environment variables are set in staging:
  - `APP_URL`
  - `AUTH_URL`
  - `AUTH_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
- Have access to:
  - one fresh email address not tied to an advertiser account
  - one existing advertiser account email
  - one advertiser login with at least one invoice

## 2) Automated Smoke
- From `anything/apps/web`, run:

```powershell
npm run smoke:launch
```

- Or point directly to staging:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/launch-smoke.ps1 -BaseUrl https://your-staging-domain.com
```

Expected:
- unauthenticated protected routes return `401`
- public submit validation still returns expected `400`
- no API route falls back to SPA HTML

## 3) Public Submit Account Creation
Use a fresh email that has never been used for an advertiser account.

Steps:
- submit a new ad through the public submit-ad flow
- continue into advertiser account creation
- create the account with email and password

Expected:
- account creation succeeds
- UI moves to the email-check step
- no internal error is shown

## 4) Anti-Enumeration Check
Use an email that already belongs to an existing advertiser account.

Steps:
- submit a new ad with that email
- continue into advertiser account creation
- attempt to create the advertiser account again

Expected:
- the flow does not reveal that the account already exists
- the response is generic
- the UI does not expose account status such as "existing advertiser account"

## 5) Resend Verification Check
From the verification step:

Steps:
- click `Resend verification email`

Expected:
- UI shows generic success language
- UI does not confirm whether the email definitely has an unverified advertiser account
- endpoint does not reveal account existence or verification state

## 6) Verification Link Origin Check
Use a newly created advertiser account and inspect the received verification email.

Expected:
- verification link points to the correct staging domain
- link does not use an unexpected host or proxy domain

## 7) Advertiser Invoice Scope Check
Sign in as an advertiser user.

Steps:
- open advertiser invoices
- open any ad-specific invoice view if available

Expected:
- only that advertiser's invoices are visible
- no cross-advertiser invoice access is possible
- no empty fallback data appears from name- or email-based matching

## 8) Media Upload Privacy Check
Upload media through the app flow that uses advertiser/admin uploads.

Expected:
- upload succeeds
- returned media link works in the app
- returned link is an app-managed URL, not a direct public storage URL
- old-style open public bucket access is not exposed by the response

## 9) Pass Criteria
- public onboarding no longer leaks whether an advertiser email exists
- resend verification no longer leaks verification state
- verification links use the configured staging origin
- advertiser invoice access is scoped correctly
- uploaded media is served through controlled access, not public bucket URLs
- automated smoke checks pass

## 10) Production Go/No-Go
Go to production only if all checks above pass in staging.

If any fail:
- do not promote the release
- capture the failing step, request payload, response status, and screenshot
- fix in staging first, then rerun this checklist
