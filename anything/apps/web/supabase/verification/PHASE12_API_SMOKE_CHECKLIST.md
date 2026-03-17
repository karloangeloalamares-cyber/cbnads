# Phase 12 API Smoke Checklist

Date baseline: March 17, 2026  
Purpose: validate concurrency/idempotency behavior after Phase 0-8 hardening rollout.

## 1) Prerequisites
- Run SQL verifier first: `supabase/verification/20260317_phase12_rollout_verification.sql`.
- Use staging first, then production.
- Have a valid admin/staff JWT with `billing:edit` + pending approval permissions.
- Export env vars:
  - `BASE_URL` (example: `https://your-app.example.com`)
  - `ADMIN_JWT`
  - `TEST_ADVERTISER_ID`

## 2) Public Submit Idempotency (same key replay)
Request twice with the same `x-idempotency-key`.

```bash
curl -X POST "$BASE_URL/api/public/submit-ad" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: smoke-submit-20260317-001" \
  -d '{
    "advertiser_name":"Smoke Test LLC",
    "contact_name":"Ops User",
    "email":"ops-smoke@example.com",
    "phone_number":"(212) 555-0100",
    "ad_name":"Smoke Public Submit",
    "post_type":"one_time",
    "post_date_from":"2026-03-20",
    "post_time":"09:00:00",
    "placement":"Standard"
  }'
```

Expected:
- Both responses are `200`.
- `pending_ad.id` is identical on both responses.

## 3) Pending Approval Concurrency
Approve the same pending id twice at nearly the same time.

```bash
curl -X POST "$BASE_URL/api/admin/pending-ads/approve" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "pending_ad_id":"<PENDING_ID_FROM_STEP_2>",
    "use_existing_advertiser":true,
    "existing_advertiser_id":"'"$TEST_ADVERTISER_ID"'"
  }'
```

Expected:
- One request succeeds (`200`, `success: true`).
- Competing request returns `409` with already-approved message.
- In successful response, `notifications_sent` is present and boolean.

## 4) Invoice Create Idempotency
Create invoice twice with same idempotency key.

```bash
curl -X POST "$BASE_URL/api/invoices/create" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: smoke-invoice-20260317-001" \
  -d '{
    "advertiser_id":"'"$TEST_ADVERTISER_ID"'",
    "advertiser_name":"Smoke Test LLC",
    "contact_name":"Ops User",
    "contact_email":"ops-smoke@example.com",
    "status":"Pending",
    "items":[
      {
        "description":"Smoke invoice item",
        "quantity":1,
        "unit_price":25,
        "amount":25
      }
    ]
  }'
```

Expected:
- Response code `201` both times.
- `invoice.id` is identical on both calls.

## 5) Credit Adjustment Idempotency + Conflict Protection
Use same key with same payload, then same key with different amount.

```bash
curl -X POST "$BASE_URL/api/admin/advertisers/$TEST_ADVERTISER_ID/credits" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: smoke-credit-20260317-001" \
  -d '{
    "amount":10,
    "reason":"Smoke idempotency test"
  }'
```

Expected:
- First call: `200`.
- Replay same payload + same key: `200` (idempotent reuse).
- Same key + different amount or reason: `409` conflict.

## 6) Convert Pending to Ad Concurrency (optional)
If using `/api/submissions/{id}/convert`, run two requests with same submission id.

Expected:
- One succeeds.
- One returns `409` already converted.

## 7) Pass Criteria
- No duplicate rows appear in SQL duplicate-key audit.
- Hardened RPC grants show `service_role` execute only where required.
- All expected status patterns above are observed in staging before production rollout.

