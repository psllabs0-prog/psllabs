# Advertising commissioning status — October 10, 2026

This release prepares consent controls and TikTok event handling. It does not activate optional Meta or TikTok collection or paid delivery. Existing store, login and checkout functionality is retained. Google and OpenAI campaign settings are outside this change.

## Release state

- Meta production dataset: `1407501624889556`.
- TikTok production pixel: `DB53OTJC77U074LG2FOG`.
- Server credentials are protected deployment secrets. Never copy them into source, browser code, logs or reports.
- `META_ADS_ENABLED` and `TIKTOK_ADS_ENABLED` remain false.
- Code verification flags remain false and production event policies remain empty.
- Prepared TikTok measurement and purchase components are not mounted. No cart hook dispatches TikTok events.
- Consent version 2 is a candidate release. It has not been deployed. Introducing TikTok must include accurate live disclosures, available provider controls and a fresh consent version; an earlier grant must not enable it silently.

## Verified tests

The disconnected Meta QA dataset `2068969863735222` shows matching browser/server event IDs with explicit deduplication for PageView, ViewContent, AddToCart and InitiateCheckout. A repeated server-only Purchase fixture also deduplicated. Its $12.34 USD amount was fictional and was never sent to the production dataset or created as a store order.

Offline tests exercise the actual privacy service and API, consent blocking and revision checks, GPC, administrator and synthetic exclusions, withdrawal races, optional-identifier cleanup, private document boundaries, and browser back/forward restoration. Meta and TikTok purchase suites each check genuine settlement requirements, value/currency, mixed-cart rejection and retry IDs. These tests do not establish production platform receipt, customer matching or audience readiness.

## Required activation gates

1. Confirm ordinary ad review, dataset/pixel binding, domain/account ownership, billing eligibility, exact audience restrictions and the remaining original spending allowance from native platform records.
2. Complete native TikTok event receipt and browser/server deduplication tests. Disable automatic matching, enhanced postback and automatic events, and verify SDK navigation/withdrawal behavior.
3. Verify production receipt without adding synthetic purchases, administrator activity or other test activity to production advertising data. Meta's current official documentation explicitly says `test_event_code` events are used for targeting and ad measurement. Its fixtures must stay in the disconnected QA asset. TikTok documents an isolated server Test Event Function; require the valid current test code and never fall back to an ordinary event.
4. Enable only reviewed, permissible event contexts, verified credentials, current consent and the matching live privacy disclosures. Never rename or mask a prohibited event to make it eligible. Consent does not override platform restrictions.
5. Observe genuine, eligible, consented non-admin production activity and verify event receipt. No historic visit/order backfill or fake purchase is permitted. API acceptance alone is not a native receipt or deduplication result.
6. Enforce withdrawal for any PSL audience use before enabling audience delivery. A platform's retention of past events does not prove a withdrawn member has been removed.
7. Activate only after the affected gates pass. No audience-size threshold blocks otherwise verified collection.

## Audience and budget constraints

Meta prospecting is U.S. age 21+, with exact selectable Chemistry and Molecular biology interests and audience expansion off. TikTok's 18–24 age bucket cannot enforce 21+, so its prepared audience uses U.S. age 25+ with genuine science interests and Smart Targeting off.

Meta's last verified spend is $18.85, leaving at most $81.15 of its original $100. TikTok's last verified spend is $58.50, leaving at most $41.50 of its separate original $100. Recheck incurred and delayed spending immediately before paid activation. Keep the old engagement/video-view campaigns paused. A replacement lifetime budget is not an additional allowance.

Prepare visitor, cart-abandoner and purchaser-exclusion definitions without representing visits as matched people. Meta delivery requires the applicable platform readiness and the owner's 100-person qualified, consented, matched threshold. TikTok requires at least 1,000 matched people for a usable Custom Audience. Do not create unusable lookalikes or claim unattended monitoring is configured.

## Primary documentation

- [Meta Conversions API: Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api.md)
- [TikTok Events API test isolation](https://ads.tiktok.com/resources/help/article/tiktok-tealium-eapi-implementation-guide?lang=en)
- [TikTok event deduplication](https://ads.tiktok.com/resources/help/article/event-deduplication?lang=en)
- [TikTok Custom Audience minimum](https://ads.tiktok.com/resources/help/article/custom-audiences?lang=en)

Owner-supplied approval messages and case IDs `9472752389` (Meta) and `3810564271` (TikTok) are recorded as reported correspondence, not independently authenticated exceptions. Ordinary ad-review results are separate platform evidence.
