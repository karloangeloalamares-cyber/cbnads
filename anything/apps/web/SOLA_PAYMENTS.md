# Sola Payments Integration

This document describes how Sola Payments is set up in the app today, what is still pending, and what values must be provided by the client before the integration is fully live.

## Current status

Implemented:
- Public Sola webhook endpoint at `/api/webhook/sola`
- Hosted invoice checkout route at `/api/invoices/sola-checkout`
- Billing UI action `Pay with Sola` for eligible unpaid invoices
- Webhook signature validation using a Sola webhook PIN
- Invoice lookup from Sola callback fields
- Invoice payment status sync into `invoices`
- Linked ad payment sync into `ads`
- Existing "payment received" email and internal notification flow reuse

Not implemented yet:
- Raw Sola callback persistence in a dedicated payment transaction table
- Partial-payment-safe transaction deduplication for repeated webhook callbacks

## Files

- Webhook route: `src/app/api/webhook/sola/route.js`
- Hosted checkout route: `src/app/api/invoices/sola-checkout/route.js`
- Hosted checkout helper: `src/app/api/utils/sola-checkout.js`
- Shared payment notification helper: `src/app/api/utils/payment-received-notifications.js`
- Existing manual notification endpoint: `src/app/api/admin/invoices/send-payment-received/route.js`
- Billing UI: `src/app/ads/page.jsx`
- App env values: `.env.local`

## Environment variables

Current placeholders in `.env.local`:

```env
# Sola Payments
# Webhook URL to configure in Sola: https://www.cbnads.com/api/webhook/sola
# Hosted checkout URL from Sola PaymentSITE
SOLA_PAYMENTS_WEBHOOK_PIN="replace-with-your-sola-webhook-pin"
SOLA_PAYMENTS_DEBUG_WEBHOOK="false"
SOLA_PAYMENTS_API_KEY="replace-with-your-sola-api-key"
SOLA_PAYMENTS_API_URL="https://secure.solapayments.com/api/transaction"
SOLA_PAYMENTS_SITE_URL="https://secure.cardknox.com/replace-with-your-paymentsite-name"
SOLA_PAYMENTS_SOFTWARE_NAME="CBN Ads"
SOLA_PAYMENTS_SOFTWARE_VERSION="1.0.0"
```

Notes:
- `SOLA_PAYMENTS_WEBHOOK_PIN` is used now by the webhook.
- `SOLA_PAYMENTS_DEBUG_WEBHOOK` should only be enabled temporarily while capturing a real webhook sample.
- `SOLA_PAYMENTS_SITE_URL` is required for the live `Pay with Sola` button. This is the merchant-specific hosted `PaymentSITE` URL, not the API endpoint.
- `SOLA_PAYMENTS_API_KEY` is not used by the current hosted checkout flow. Keep it for future direct API/reporting work.
- `SOLA_PAYMENTS_API_URL` remains the transaction API endpoint for future direct server-side operations.

## Hosted checkout behavior

The app now uses Sola `PaymentSITE` for the real invoice payment flow.

Flow:

1. An unpaid invoice is opened in Billing.
2. The user clicks `Pay with Sola`.
3. The app calls `/api/invoices/sola-checkout`.
4. The server validates invoice access and outstanding balance.
5. The server builds a hosted `PaymentSITE` URL with invoice metadata.
6. The browser opens Sola's hosted payment page.
7. Sola sends the final payment status back through `/api/webhook/sola`.

Fields currently sent to `PaymentSITE`:

- `xAmount`: current outstanding balance
- `xInvoice`: invoice number
- `xCustom01`: invoice id
- `xCustom02`: advertiser id
- `xEmail`: invoice contact email when available
- `xDescription`: invoice label
- `xComments`: CBN Ads invoice note
- `xRedirectURL`: return to Billing after an approved payment
- `xRedirectURL_NotApproved`: return to Billing after a declined/cancelled payment
- `xSoftwareName`
- `xSoftwareVersion`

Current guardrails:

- invoices already marked `Paid` are blocked
- invoices paid via credits are blocked
- invoices with an existing partial payment are blocked for now

That last restriction is deliberate: until we persist and deduplicate transaction refs, partial-payment accumulation would be easy to misstate if Sola retries a callback.

## Webhook behavior

Sola posts `application/x-www-form-urlencoded` payloads to:

```txt
https://www.cbnads.com/api/webhook/sola
```

The route currently does this:

1. Reads the raw form body.
2. Validates `ck-signature` if `SOLA_PAYMENTS_WEBHOOK_PIN` is configured.
3. Parses the form fields.
4. Accepts only approved payment events.
5. Finds the related invoice.
6. Updates `amount_paid`, `status`, and `updated_at` on the invoice.
7. Marks linked ads as paid when the invoice is fully paid.
8. Recalculates advertiser spend.
9. Sends advertiser/internal payment-received notifications once on first paid transition.

## Invoice matching

The webhook tries to match the incoming payment to an invoice using these fields in order:

- `xInvoice`
- `xCustom01`
- `xCustom02`
- `xOrderId`

Matching strategy:
- First try `invoice_number`
- Then try invoice `id`

Current outbound mapping in the hosted checkout route:

- `xInvoice`: invoice number
- `xCustom01`: invoice id
- `xCustom02`: advertiser id or internal order id

That gives us a stable primary key plus two fallbacks.

## Approved payment detection

The current route treats the callback as payable only when the response indicates an approved transaction.

It currently accepts:
- `xResult=A`
- or an approved textual status such as `xResponseResult=approved`

It intentionally ignores non-sale style commands such as:
- save-only
- AVS-only
- credit
- refund
- void
- reverse

If Sola returns a different approval shape in production, update `isApprovedPaymentEvent()` in `src/app/api/webhook/sola/route.js`.

## Signature validation

If the client enables webhook signing in the Sola dashboard, the route expects:

- Header: `ck-signature`
- Secret: `SOLA_PAYMENTS_WEBHOOK_PIN`

The validation logic follows the Sola/Cardknox webhook pattern:
- sort form keys alphabetically
- concatenate decoded values
- append the webhook PIN
- compute MD5

If the PIN is missing in env, the route currently skips signature validation so development is not blocked.

Before production launch, the PIN should be set and webhook tests should be rerun.

## Data flow into CBN Ads

When Sola reports a successful payment:

- `invoices.amount_paid` is updated from the webhook amount
- `invoices.status` becomes `Paid` when the amount covers the invoice total
- linked `ads.payment` becomes `Paid`
- linked `ads.paid_via_invoice_id` is set
- advertiser spend is recalculated from paid invoices
- payment confirmation emails/internal notices are sent through the existing app flow

## Remaining implementation plan

Next likely improvements:

1. Capture and store real Sola transaction refs in a dedicated payment/event table.
2. Use that transaction log to make partial payments and duplicate webhook retries fully safe.
3. Add a Billing return-state toast after `PaymentSITE` redirects back into `/ads`.
4. Optionally add Sola payment links into invoice reminder emails.
5. Add tests for:
   - approved webhook
   - unknown invoice
   - invalid signature
   - duplicate paid callback
   - partial payment once transaction logging exists

## Testing checklist

For a live end-to-end test:

1. Set `SOLA_PAYMENTS_WEBHOOK_PIN` in `.env.local` and the deployment environment.
2. Set `SOLA_PAYMENTS_SITE_URL` to the merchant's real hosted `PaymentSITE` URL.
3. Configure Sola webhook URL as `https://www.cbnads.com/api/webhook/sola`.
4. Create a test invoice in the app with no partial payment recorded.
5. Open that invoice and click `Pay with Sola`.
6. Complete the hosted payment on Sola.
7. Confirm the invoice becomes paid.
8. Confirm linked ads become paid.
9. Confirm advertiser/internal notifications send once.
10. Retry the same webhook and confirm it does not resend duplicate payment notifications.

## Source references

Official docs used for this integration plan:

- Transaction API: https://docs.solapayments.com/api/transaction
- Webhooks: https://docs.solapayments.com/api/webhooks
- Response parameters: https://docs.solapayments.com/api/response-parameters
- Hosted websites / PaymentSITE: https://docs.solapayments.com/products/websites
