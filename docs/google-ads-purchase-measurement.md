# Google Ads purchase measurement

Purchase measurement is inactive unless all three public build settings are present:

| Setting | Value verified in Google Ads on October 5, 2026 |
| --- | --- |
| `NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED` | `true` |
| `NEXT_PUBLIC_GOOGLE_ADS_TAG_ID` | `AW-18417755392` |
| `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` | `y0J1COSNmpIdEIDKos5E` |

These are public tag identifiers, not credentials. The native Google Ads action is **PSL Labs - Verified Purchase** (ID `7822804708`), with variable values and USD. The exact destination is `AW-18417755392/y0J1COSNmpIdEIDKos5E`. Changing these values requires rebuilding the site. Use branch-scoped preview settings for verification; do not activate unrelated preview branches.

## What is counted

1. The visitor explicitly allows Google measurement; Global Privacy Control overrides consent. The Google script does not load before consent, after a saved decline, or on admin pages. The footer provides an Advertising preferences control.
2. Checkout records the consent choice in the existing attribution object. Browser-supplied private receipt markers are discarded.
3. Existing strict Tagada completed-payment or settled BTCPay handling records an immutable private measurement marker. Checkout and fulfillment do not depend on measurement succeeding.
4. The success page requests a receipt only for a paid or shipped order. The receipt service verifies the provider again and rechecks the current order, consent, marker, amount, paid date and finance reporting exclusions after that read. A marker is valid for 24 hours; historical orders are not backfilled.
5. The browser sends only the action destination, opaque transaction ID, USD amount and currency, with a sanitized page URL. It uses in-memory and local duplicate guards; Google also receives the same transaction ID for deduplication.

The value is the verified order total, including charged shipping. It is revenue, not profit or commission. Name, email, address, card details, provider references and product names are not included in the conversion event. Enhanced conversions, personalized advertising and automatic page-view events are disabled. Google still receives ordinary browser/network information after consent, as explained by the privacy policy.

Consent is remembered for up to 180 days. Local duplicate markers are treated as expired after 30 days. Revoking consent stops new purchase events and sends a denied consent update to a tag that was already loaded. No purchase events are intentionally sent for declined/GPC visitors.

## Verification and limits

- `npm run test:google-ads` checks configuration, explicit consent, payload redaction, deduplication, receipt freshness, provider verification, SQL guards and API failure states without external effects.
- `npm run test:card-verification`, `npm run test:openai-ads`, `npm run test:public-order-privacy` and `npm run test:partners` retain payment, privacy and cross-channel regression coverage.
- Production-build browser checks cover phone layout, decline persistence, preference changes, GPC, admin exclusion, paid status without a receipt, receipt delivery and refresh deduplication.
- A separate browser inspection loaded the real public Google tag script while aborting every measurement request. Landing query strings, SPA navigation and success-page payment/order references were checked for private fixture leakage. No test conversions were transmitted.

A queued event or successful script load does not prove Google accepted, attributed or reported a purchase. After release, use the next genuine consenting customer's completed order and the account's conversion diagnostics to verify live reporting. Browser blocking, no consent, leaving before verification or returning after the receipt window can prevent measurement. Do not fabricate purchases or replay historical orders to make diagnostics turn green.

To disable measurement, set the enabled flag to `false` and rebuild/redeploy. Keep the ad campaign paused until its separate policy, targeting and budget checks are complete.

References: [Google consent mode implementation](https://developers.google.com/tag-platform/security/guides/consent), [Google Ads website conversion setup](https://support.google.com/google-ads/answer/7548399), [Google tag privacy controls](https://developers.google.com/tag-platform/security/guides/privacy).
