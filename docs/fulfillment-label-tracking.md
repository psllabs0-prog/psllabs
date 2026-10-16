# Fulfillment labels and automatic tracking

Admin ledger now links to **Fulfillment & labels** (`/admin-fulfillment`). A paid order progresses through packing, packed, a reviewed postage quote, label purchase, saved tracking, and a tracking-ready email. Label creation does not mark the package shipped. Paid orders with saved tracking appear in **Labels ready / tracking** and remain in the ledger until the owner confirms carrier handoff there.

## Release settings

Both new settings default to off. This branch has not changed production configuration, purchased postage, contacted a carrier, or emailed a customer.

| Server setting | Meaning |
| --- | --- |
| `PSL_FULFILLMENT_LABEL_FLOW_ENABLED=true` | Allows an authenticated owner to confirm a prepared label purchase. No background purchase job is installed. |
| `PSL_FULFILLMENT_TRACKING_EMAIL_ENABLED=true` | Sends the tracking-ready notification after a real label and tracking are saved. Off leaves a visible pending notification. |
| `BTCPOSTAGE_TEST_MODE=true` | Existing BTCPostage USPS test mode. Test labels never attach tracking to the order and never send customer notifications. |

Existing `BTCPOSTAGE_API_KEY` / `BTCPOSTAGE_API_SECRET`, sender identity/address settings, database and SMTP settings remain server-only. A complete real sender identity is required, including the verified U.S. origin ZIP **85016**. No sender street address is guessed. Preview requires a packed, paid, inventory-settled USD order with no reconciliation warning or reporting exclusion.

The package preset is the owner's approved **8 oz, 6 × 4 × 3 in Parcel, at most 10 vials**. Outside those bounds, or for legacy orders without a saved carrier service, use manual review. The measured package must match the preset; this feature does not infer its weight from the product name.

Standard customer shipping prices and eligibility are unchanged. A saved Standard selection buys USPS Ground Advantage. A saved Priority selection buys the exact verified USPS Priority service. No cheapest-service fallback exists. Priority's existing **$24.99 at merchandise subtotal up to $100 / $22.99 over $100** remains in checkout; the live carrier cost plus $0.50808 packaging rounded upward and the approved $2 reserve must fit the collected fee before purchase. This feature adds no new Standard cost rule or customer shipping charge.

## Review and enable

1. Review the desktop/mobile admin preview and this branch. Run `npm run test:fulfillment-shipping`, existing shipping checks, TypeScript and lint.
2. Apply `npm run migrate:fulfillment-shipping` against the intended database after release approval. It creates only the preview-token and notification-outbox tables and existing order fields.
3. Verify server-only carrier credentials, complete sender address, SMTP, and test/live mode. Keep both new flags off until the owner approves the concrete flow.
4. A reviewed test-mode integration can be run against a dedicated test order/database. Mocked tests already cover provider, storage and SMTP effects; no live/test-provider request has been made by this implementation.
5. When explicitly enabled for live use, each packed order still requires **Prepare label**, then owner confirmation of that order's exact postage cost. An expired, consumed or changed-order preview must be prepared again. There is no unattended paid-purchase toggle.

## Retry and reconciliation

One server-stored, five-minute, single-use preview binds the order, recipient, saved service, normalized address, origin, package and test/live mode. Purchase uses the existing atomic one-label-per-order claim and rechecks current payment, packing and exact carrier rate immediately before dispatch. Price increases require another review.

An uncertain carrier response or failure saving an accepted purchase stays locked for review. Use **Check status**, then **Retrieve purchase** for the known provider purchase ID. Retrieval cannot create another label, substitute a different recorded purchase, or replace different saved tracking. Purchased labels missing a tracking number or PDF can be retrieved again.

The [official BTCPostage API](https://btcpostage.com/api-documentation) documents a purchase against the account's credit balance and a separate retrieval endpoint. It does not document a locked quote ID, maximum-charge field or request idempotency key. The application therefore checks the exact rate immediately before the purchase and owns duplicate protection itself; it cannot promise a carrier-enforced price lock during that final interval. The real returned postage cost remains stored on the label for review. No paid tracking-webhook registration or account top-up is added.

Tracking plus its unique per-order notification entry are persisted before SMTP. Sending takes an atomic claim; the manual ledger handoff path uses the same claim. A stable Message-ID aids investigation but is not treated as a provider deduplication guarantee. A timeout, server crash or failure after SMTP acceptance is held as **needs review**, never automatically resent. Check the mailbox's Sent messages/provider logs using that order's Message-ID before any separately authorized manual resend. No blind resend button is offered.

The new tracking-ready email says the label is ready and that tracking updates begin when the carrier scans the package. If the package is later marked shipped, the already-delivered tracking notification is not sent again. Existing orders that already have `tracking_email_sent` are also not re-notified.

The preview and purchase APIs require admin authentication and same-origin POSTs; responses are private/no-store. API errors do not echo carrier response bodies or credentials. No customer information is sent to analytics by this feature.

## Verification scope

The offline suite executes the actual orchestration, carrier purchase service and email dispatcher with in-memory provider/database/SMTP fixtures. It covers exact service matching; paid/packed/inventory and reconciliation gates; package limit; cost increases; changed orders/addresses; origin checks; expired and concurrent previews; one purchase; test-mode isolation; failure after provider success; persisted tracking before SMTP; concurrent notification claims; and accepted-then-timeout SMTP recovery. Existing Priority shipping tests verify the approved shipping tiers and package/service rules. These checks do not establish the account's live balance, real sender street, or provider/SMTP reachability.
