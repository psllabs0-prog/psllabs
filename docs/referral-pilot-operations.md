# PSL referral pilot — implementation and operation

The pilot is a single-level laboratory-research partner program. Applicants are
not accepted automatically. The existing acquisition partner store and admin
authentication are reused; no separate customer or marketing-subscriber records
are created by applying.

## Terms implemented

- At most 10 active, manually reviewed pilot partners (start with 5–10).
- 10% product discount on a new buyer's first eligible paid order, identified by
  checkout email. No self-referrals, code stacking, tiers, or lifetime commissions.
- 10% commission on the discounted product subtotal, less refunded product value.
  Tax, shipping, processor fees, and subsequent orders are excluded from its base.
- Minimum 30 days after confirmed completed delivery; verified finance, manual
  refund and fraud review, and test/admin exclusion must pass before payable.
- Monthly manual payouts under agreed partner arrangements. No bank account is
  connected, payment is not automatic, and no minimum payout balance is invented.
- Existing outreach partners get no new financial entitlement until explicitly
  approved for these terms. Existing independently agreed obligations are not
  overwritten by the migration.

## Current payment scope

Bitcoin referral checkout is supported. The referral discount replaces the
existing 5% Bitcoin concession; it does not combine with it. Normal nondiscounted
card checkout remains unchanged. Referral card checkout is blocked before order
reservation because Tagada's headless session currently uses full-price variant
IDs and no equivalent provider promotion has been verified.

Before enabling referral card discounts, create a genuine 10% product promotion
and matching code in the existing Tagada merchant store, restrict it to first-time
customers, disable combination, read back its saved restrictions, apply it using
the installed headless SDK's documented `checkout.applyPromoCode`, and verify that
the provider totals and currency match the PSL order before card tokenization or
charge. Do not assume the untyped SDK creation fields establish a valid promotion.
Official provider guide:
https://docs.tagadapay.com/knowledge-center/discounts-offers/how-to-create-discount-codes

## Deployment

Review `lib/partners/referral-store.ts` and run the explicit additive migration
`scripts/migrate-referral-pilot.ts --apply` with the actual production environment.
It creates no application, partner approval, customer, order, or email. It does not
modify order/payment/stock functions, catalog prices, or existing partner terms.

If production credentials remain available only to the deployed runtime, use the
existing authenticated administrator session to send this exact request:

```js
fetch("/api/admin/partners", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-PSL-Partners-Action": "1" },
  body: JSON.stringify({ action: "initialize_referral_pilot", setupVersion: "psl-referral-pilot-v1" })
}).then(async response => ({ status: response.status, result: await response.json() }));
```

The endpoint requires the existing admin session, same-origin browser request,
action header, JSON format, size limit, and exact setup version. Additional fields,
custom SQL, table names, and schema inputs are rejected. It invokes only the
reviewed known migration and reads back all five new tables, four functions, and
the activation-limit trigger. It creates no partner, approves no application,
sends no email, changes no orders, and performs no payment or payout.

The response includes separate booleans for partner-auth secret configuration,
auth schema, and SMTP configuration. `smtpDeliveryVerified: false` means this
schema action did not test real mail delivery. A missing secret or mail setting
must be resolved before advertising partner sign-in as operational. The migration
is idempotent, uses only known `CREATE ... IF NOT EXISTS` / `CREATE OR REPLACE`
objects, and may be retried after an interrupted schema setup. No generic runtime
migration tool is exposed. `CREATE OR REPLACE TRIGGER` preserves the known guard
without a separate drop/recreate gap; PostgreSQL's supported-version syntax is
documented at https://www.postgresql.org/docs/current/sql-createtrigger.html.

Provision a random server-only `PARTNER_AUTH_SECRET` of at least 32 characters.
Set server-only `REFERRAL_CODES_ENABLED=true` only after migration and coupon
checks pass. Missing/non-exact values disable new referral discounts. The browser
code field is a display capability and never grants permission to redeem a code.
Reuse existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`; never put
these values in client code or logs. Missing schema, mail, protection, or auth
configuration fails closed.

## Authentication and privacy

- Partner email sign-in uses random 256-bit tokens, hashed at rest, expiring in
  15 minutes. GET verification displays an explicit confirmation; POST redeems
  atomically once, protecting against email link scanners and replay.
- SMTP has bounded connection/greeting/socket timeouts, requires TLS, checks that
  the intended stored recipient was accepted without any rejected recipient, and
  closes its transport. Failed or ambiguous send attempts invalidate the sign-in
  token; no blind SMTP retry is performed. Acceptance is not proof of inbox delivery.
- Expired sign-in redirects stay on `/partners/account?signin=expired`, outside
  public-page advertising and analytics collection.
- Sessions are random, signed, stored by hash, HttpOnly/SameSite=Lax/Secure in
  production, and expire after 7 days. New sign-in revokes older sessions; logout
  revokes the server session. Admin authentication remains separate.
- Sign-in requests return generic responses, reject other origins, and are limited
  by IP and by partner record. No newsletter consent is inferred from sign-in.
- Private account endpoints derive identity only from a verified server session,
  query only that partner, and expose no buyer email, address, full order ID, or
  payment reference. Order references are opaque HMAC values.
- Explicitly entered checkout codes are operational discount selections. No
  optional cookie or browser referral storage is necessary to redeem them.
  Persistent referral-link attribution continues through PSL's existing optional
  measurement consent, GPC, withdrawal, and excluded-path controls.
- Admin and synthetic data never become payable; excluded finance rows cannot
  disqualify a genuine new buyer as a prior production customer.

## Owner workflow

1. Review applications in `/admin-partners`, the proposed audience and actual
   research-only content, disclosure, and acceptance of terms.
2. Approve the referral pilot explicitly. The code becomes eligible only when
   both the partner and financial terms are active. Reactivation is capped too.
3. Give the partner their code and link and clearly disclose the current Bitcoin
   redemption scope. Partner login can show application status before approval.
4. For fulfilled referral claims, confirm actual delivery and refunded product
   amounts. Review real payment/refund and fraud records; no claims auto-pay.
5. At the monthly manual payout review, retain an external payout record. This
   initial dashboard shows eligible amounts for review and does not initiate or
   reconcile bank transfers. Do not describe it as an automated payout service.

An abandoned discounted checkout retains its claim while pending to prevent two
live discounted invoices for one first order. The existing verified BTCPay
expiry/failure webhook naturally releases that pending state. If provider setup
failed or a webhook was missed, the owner can release an expired claim only after
confirming with the provider that no payment is settled or pending. The action
marks the pending order failed and initiates no refund, transfer, or email. Do not
infer "unpaid" from age alone.

## Testing and limits

`scripts/test-referral-pilot.ts` runs offline fixtures covering 10/10 integer-cent
calculation, refunds, first-order/test/self exclusions, delivery holds, BTC
nonstacking, ordinary BTC preservation, pending releases, hash-only tokens,
one-time redemption, signed cookie tampering/expiry, session ownership/logout,
and additive migration boundaries. SQL invariants are inspected with a mocked
database. This is not a claim that live provider settlement or real payouts were
tested. Production checks should read saved schema/configuration and use isolated
transport mocks; do not place a real test order or send customer marketing mail.

First-order identity uses the entered checkout email, not independently verified
person identity. Other email addresses or related parties require owner fraud
review. Verified refunds/voids recorded by the provider block payment; partial
refund allocations must be confirmed manually. The dashboard's recent-detail
list is capped at 1,000 claims, so it must not be described as an uncapped lifetime
accounting export. Product COGS and variable costs are not fully established;
profitability must be reviewed before raising commission or discount levels.

## Reversible rollback

Remove or set the server deployment environment `REFERRAL_CODES_ENABLED=false`,
redeploy, stop new applications/sign-ins, and deactivate
new pilot terms. Keep existing claim/commission/token records for audit and retain
the prior deployment for rollback. Do not drop financial records or modify paid
orders merely to reverse the UI. The new trigger/functions may be removed after
the related features are disabled, without altering shared inventory functions.
