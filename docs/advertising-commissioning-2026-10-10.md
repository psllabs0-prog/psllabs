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

The clean Next.js 16.3.8 production build, privacy suite and both provider event suites passed. TikTok's disconnected QA pixel `DB547TBC77UAOLDV5VHG` received browser Pageview, ViewContent, AddToCart and InitiateCheckout events, plus isolated server test events. Actual SDK requests were absent before consent and stopped on withdrawal; navigation did not emit automatic events. Matching IDs were transmitted through both channels. Native browser/server deduplication remains unverified; an HTTP acknowledgement or an unchanged aggregate count is insufficient evidence.

TikTok's production pixel received the sanctioned isolated server ViewContent test `c363e0c2-068f-4a62-8a42-34a2991b7623`, verified in native Test Events with its genuine product path and SKU. No ordinary production event or fictional production Purchase was sent. The source still reports "Not ready for campaign"; isolated test receipt does not establish audience collection or real production activity.

## Native account and campaign readback

- Meta independently approved ad `120254313408650204`. Campaign `120254313408630204` and ad set `120254313408640204` remain off; lifetime replacement budget is $81.15. Optimization is LANDING_PAGE_VIEWS and billing is IMPRESSIONS. Dataset `1407501624889556` is selected on the ad. The domain psllabs.org is verified and owned by PSL Labs.
- TikTok phone verification is complete. Website campaign `1878669821944689`, ad group `1878669859187922` and ad `1878671783090337` remain saved, unpublished drafts. Engaged-session optimization bills by impression (oCPM); the one ad group's lifetime budget is $41.50. The native two-day minimum is $40. The production event source is not yet a usable saved optimization connection.
- Both destinations are `https://www.psllabs.org/products`, return HTTP 200, use Learn More, and describe research materials without human-use claims. New website campaigns have no paid delivery, so website CPC and cost per landing-page view are unavailable.
- Native lifetime spending on October 10 is Meta $18.85 and TikTok $58.50. Both original engagement/video-view campaigns remain paused. No replacement paid delivery was enabled and no original allowance was increased. Recheck delayed charges before launch.
- Protected server credentials are staged in hosting configuration with both provider enable flags false. The candidate integration is saved in draft PR #37, not deployed. Production optional Meta/TikTok collection remains off; audience definitions are prepared but no usable matched audiences or lookalikes were created.

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
