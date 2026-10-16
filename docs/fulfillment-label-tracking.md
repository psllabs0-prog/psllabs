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

## Explicit fake-order integration check

`scripts/test-fulfillment-shipping-pg.ts` is plan-only unless invoked with `--run-isolated-qa` and one explicit protected configuration source (`--environment` or `--env-file=...`). It uses a random `psl_fulfillment_qa_YYYYMMDD_<16hex>` schema with **no public fallback**. Every application SQL statement checks its connection's actual schema before running. The script applies the real application schemas, creates two fake orders, settles only their private inventory, exercises the label preview/purchase/notification code, and removes only the temporary schema after checking its database identity, ownership and original OID.

Default carrier responses and mail transport are mocked. `--provider-test` permits the real BTCPostage USPS endpoints only with `test_mode=true`, using the configured real sender as the test destination. That case must still leave order tracking and customer notifications untouched. No credits are added and no live label or paid tracking webhook is requested.

The second case uses an explicitly mocked carrier response to exercise real PostgreSQL tracking/outbox updates and the actual notification dispatcher. `--send-test-email --recipient=lukeghaz@gmail.com` permits **at most one SMTP attempt for the fixed `20261016-lukeghaz-fulfillment-test` authorization**, to that exact recipient only, with a prominent TEST-only subject/body and fake tracking. A minimal durable receipt in the separate `psl_fulfillment_qa_receipts.mail_authorizations` table stores only authorization key, recipient hash, stable Message-ID, status and timestamps. It is retained when fake orders/inventory are removed. No new schema name, nonce, source commit or build retry can reclaim that authorization. Prior unconfirmed/uncertain sends fail the QA mail check and require Sent-mail review; prior confirmed SMTP acceptance is reported as previously accepted with no new send. No blind resend is offered.

This does not turn a USPS test label into a real customer shipment. Normal production test-label guards remain unchanged. The report distinguishes mocked carrier behavior, actual no-debit test-provider calls, SMTP acceptance, and separately verified inbox arrival. Provider redirects are refused so API credentials cannot be forwarded to a different endpoint.

If local access to existing sensitive bindings is unavailable, an operator-only prebuild hook supports a staged production deployment with `--skip-domain`. The hook runs only with `PSL_FULFILLMENT_QA=reviewed-isolated-20261016-v1`, the exact PSL Vercel project, production build context, a matching `PSL_FULFILLMENT_QA_EXPECTED_COMMIT` / `VERCEL_GIT_COMMIT_SHA`, and a 32-hex `PSL_FULFILLMENT_QA_NONCE`. Supply these for that one build only. They do not enable runtime purchases or customer email, create an HTTP endpoint, change production account settings, or promote a deployment. An integration failure fails that staged build.
