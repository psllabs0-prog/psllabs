# Proposed first website-advertising release — October 11, 2026

Status: draft release prepared for review. No production tracking, campaigns, audiences, spending limits or public website settings changed by this reassessment. The owner requested approval of the deployment/activation step. Source changes are held in the unpublished release branch; protected deployment enable flags remain false.

## Correction to the earlier gate

No documented Meta requirement was found for recruiting an independently credentialed laboratory researcher or receiving a genuine production event before launching an otherwise eligible Traffic/landing-page-view campaign. Those were additional verification gates introduced during the prior setup. They are removed from the launch proposal. Production receipt remains **unverified** and will be checked as ordinary consenting visitors arrive.

Meta's use of test-code events for targeting/measurement requires keeping synthetic tests in the disconnected QA dataset. It does not establish a researcher-recruitment or pre-launch receipt requirement.

The existing site gate asks visitors to declare that they are 21+ and intend laboratory research only. It stores a browser-local declaration. It verifies no identity, employer, professional credentials or actual research activity. Optional advertising consent is separate. A gate declaration never grants cookie consent, overrides data restrictions or proves that a visitor is a qualified purchaser. The server independently checks current advertising consent and exclusions; the existing consent record is not a researcher-credential record.

## Smallest supported first step: Meta catalog PageView and existing LPV ad

After owner approval:

1. Release the regression-tested activation delta on the existing reviewed integration. The renamed code gate represents scoped QA activation readiness, not observed genuine production receipt. Keep the protected production credential and dataset `1407501624889556`; enable `META_ADS_ENABLED` only for the approved release.
2. Limit production event policy to `approvedPaths: { PageView: ["/products"] }` and `approvedProductIds: []`. Send the actual eligible catalog URL and matching stable browser/server event IDs. Do not enable ViewContent, AddToCart, InitiateCheckout or Purchase, and do not send laboratory-intent declarations or customer contact details as advertising parameters.
3. Retain both existing Meta measurement and personalization permission checks. Ordinary Meta events can be used by Meta for both disclosed purposes; this release must not be represented as a verified measurement-only/no-personalization supplier mode. Keep PSL retargeting, customer matching, purchaser exclusions and lookalikes inactive.
4. Use fresh consent version 3 and accurate catalog-only disclosures. Preserve exact banner wording, equal Accept/Decline accessibility, persistent preferences, GPC, saved-consent revision checks, synchronous withdrawal, browser document boundaries and admin/test/synthetic exclusions. Keep essential shopping/login/checkout working. The entry gate's proposed title is "Age and research-use confirmation"; its existing declarations and browser state remain unchanged. Both TikTok capabilities and its enable flag stay off.
5. Deploy the reviewed change, verify live consent/configuration and blocked contexts without sending fabricated production events, then activate the existing approved Meta campaign `120254313408630204`, ad set `120254313408640204`, ad `120254313408650204`. Keep U.S. age 21+, exact Chemistry and Molecular biology interests, expansion off, manual approved Facebook/Instagram placements, destination `https://www.psllabs.org/products`, Learn More and the approved RUO creative. Optimization remains LANDING_PAGE_VIEWS; billing remains IMPRESSIONS.
6. Read back the saved configuration and actual delivery status. Report **QA passed; production receipt awaiting ordinary consenting traffic** until Events Manager confirms it. Treat actual delivery/configuration errors as failures; do not replace them with assumed passes. No ongoing monitoring mechanism is claimed or created by this proposal.

This deliberately narrow first release does not measure every site visit. The existing SDK referrer guard can block same-site arrivals from unapproved paths; do not silently broaden its scope. The draft code is prepared, but environment gating keeps all live Meta/TikTok capabilities off until approved deployment. Production receipt remains unverified.

## Budgets and unaffected systems

Latest refreshed Meta table: old campaign Off/$18.85; replacement Off/$0.00. Maximum label still ends October 10, so separate October 11 spending is not verified. Replacement lifetime budget must be **no more than $81.15**, reduced by any additional incurred or delayed spending found immediately before launch. Do not reset a spending counter or create another $100 allowance.

TikTok's native lifetime report through October 11 shows $58.50 spent and its old campaign Off, leaving **at most $41.50**. No TikTok paid activation is part of the smallest Meta-first step. Its saved two-day draft schedule needs rebasing before any later launch; the verified two-day minimum is $40, and launch cannot proceed if updated remaining funds fall below the actual minimum.

Keep both old campaigns paused. Google Ads, ChatGPT/OpenAI Ads and organic publishing are unchanged.

## TikTok: separate supported path to assess

TikTok officially supports Engaged Session without a pixel in selected regions and Traffic/LPV with optional pixel tracking. Therefore the production source's earlier Not ready status is not, by itself, a universal Traffic launch blocker. Account-specific availability and validation of a no-pixel path have not been verified in this reassessment. Native read-only work stopped when the owner resumed the browser; no new submission was attempted.

A later approved no-pixel Traffic path would keep PSL TikTok browser/server collection off, use ordinary platform ad reporting and normal review, preserve U.S. 25+ science targeting with Smart Targeting off, and retain the $41.50 maximum lifetime ceiling. Do not label it verified website tracking or audience collection. Overlapping Pixel/API collection still requires deduplication verification; it remains unverified. Source readiness, production receipt, matched audience sizes and lookalikes must not be fabricated.

## Evidence

- Activation-delta validation passed: production build and TypeScript, Meta event/browser/API/transport/Purchase tests, privacy service/API/browser-signal/lifecycle tests, Google advertising regression tests, OpenAI advertising regression tests, and targeted lint. These are build/QA results, not a claim of genuine production receipt or native TikTok deduplication.
- [Meta CAPI verification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/verifying-setup.md)
- [Meta test-event behavior](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api.md)
- [TikTok Engaged Session without a pixel](https://ads.tiktok.com/resources/help/article/how-to-set-up-engaged-session?lang=en)
- [TikTok LPV, optional pixel](https://ads.tiktok.com/resources/help/article/landing-page-view?lang=en)
- [TikTok deduplication requirements](https://ads.tiktok.com/resources/help/article/event-deduplication?lang=en)
- Native read-only spending/status audit: `C:/Users/Luke/AppData/Local/Temp/psl-native-readonly-reassessment-20261011.json`.

Owner-supplied approval letters and case IDs remain recorded as reported correspondence. Meta's exact catalog ad approval is separate platform evidence; neither implies that every product event, audience feature or future campaign is approved.
