# Sola Payments Integration

This document describes how Sola Payments is set up in the app today, what is still pending, and what values must be provided by the client before the integration is fully live.

## Current status

Implemented:
- Public Sola webhook endpoint at `/api/webhook/sola`
- Webhook signature validation using a Sola webhook PIN
- Invoice lookup from Sola callback fields
- Invoice payment status sync into `invoices`
- Linked ad payment sync into `ads`
- Existing "payment received" email and internal notification flow reuse

Not implemented yet:
- Outbound transaction creation to Sola from the invoice/payment UI
- Hosted payment flow or embedded checkout flow
- Raw Sola callback persistence in a dedicated payment transaction table

## Files

- Webhook route: `src/app/api/webhook/sola/route.js`
- Shared payment notification helper: `src/app/api/utils/payment-received-notifications.js`
- Existing manual notification endpoint: `src/app/api/admin/invoices/send-payment-received/route.js`
- App env values: `.env.local`

## Environment variables

Current placeholders in `.env.local`:

```env
# Sola Payments
# Webhook URL to configure in Sola: https://cbnads.com/api/webhook/sola
SOLA_PAYMENTS_WEBHOOK_PIN="replace-with-your-sola-webhook-pin"
SOLA_PAYMENTS_API_KEY="replace-with-your-sola-api-key"
SOLA_PAYMENTS_API_URL="https://secure.solapayments.com/api/transaction"
SOLA_PAYMENTS_SOFTWARE_NAME="CBN Ads"
SOLA_PAYMENTS_SOFTWARE_VERSION="1.0.0"
```

Notes:
- `SOLA_PAYMENTS_WEBHOOK_PIN` is used now by the webhook.
- `SOLA_PAYMENTS_API_KEY` is reserved for the outbound transaction step.
- `SOLA_PAYMENTS_API_URL` should stay on the Sola transaction endpoint unless the client gives a different environment URL.

## Webhook behavior

Sola posts `application/x-www-form-urlencoded` payloads to:

```txt
https://cbnads.com/api/webhook/sola
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

Recommended outbound mapping when we build the payment request:

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

The next step after the client sends the webhook PIN is outbound payment initiation.

Planned approach:

1. Add a server-side Sola payment helper that posts to `SOLA_PAYMENTS_API_URL`.
2. Send invoice metadata in the transaction request:
   - `xInvoice`
   - `xCustom01`
   - `xCustom02`
   - `xAmount`
3. Decide whether the user pays through:
   - a hosted payment link returned by Sola
   - or a direct server-side charge flow
4. Add an invoice UI action such as "Pay with card".
5. Add test cases for:
   - approved webhook
   - partial payment
   - unknown invoice
   - invalid signature
   - duplicate paid callback

## Testing checklist

When the client provides the webhook PIN:

1. Set `SOLA_PAYMENTS_WEBHOOK_PIN` in `.env.local` and the deployment environment.
2. Configure Sola webhook URL as `https://cbnads.com/api/webhook/sola`.
3. Create a test invoice in the app.
4. Send a Sola test transaction with:
   - `xInvoice` = invoice number
   - `xCustom01` = invoice id
5. Confirm the invoice becomes paid.
6. Confirm linked ads become paid.
7. Confirm advertiser/internal notifications send once.
8. Retry the same webhook and confirm it does not resend duplicate payment notifications.

## Source references

Official docs used for this integration plan:

- Transaction API: https://docs.solapayments.com/api/transaction
- Webhooks: https://docs.solapayments.com/api/webhooks
- Response parameters: https://docs.solapayments.com/api/response-parameters
