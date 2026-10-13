# PSL Labs approved visual refresh

Approved October 13, 2026. Implemented on `codex/visual-refresh-20261013`, based on production commit `468da9addbc4b09250b63743279e0d92bde2200a`.

## Design scope

Dark PSL brand shell, off-white catalog pages, white information panels, Archivo/Inter typography, restrained corners and consistent controls. Static original vial artwork replaces the animated hero scene. Homepage and catalog share product cards. All five released product pages retain actual data, batch documents, label discrepancies, storage information and FAQs. Mobile cart line totals are visible; checkout field boundaries are stronger.

Original products, prices, reports, labels and URLs are unchanged. No invented photography, certifications, endorsements or customer reviews. Inventory, order, payment, consent and advertising rules retain their production behavior when the preview flag is absent.

## Preview isolation

Set `PSL_VISUAL_PREVIEW=1` at both build and runtime for this design preview only. Do not deploy an interactive design preview without this flag. The flag is server controlled; no request data enables it.

- Operational SQL is denied even if database credentials or a cached connection exist.
- Private/admin routes, financial ledgers, orders, payment creation/confirmation, emails, webhooks, cron actions and advertising APIs are blocked.
- Browser analytics, attribution and advertising components are not mounted.
- Retained card sessions and card-return hints cannot mount the card provider. Valid preview form submissions stop before checkout analytics or payment handlers; validation remains available.
- Cookie preferences use isolated ephemeral receipts, with all advertising capabilities permanently false. Withdrawal and GPC remain effective.
- Public inventory availability is explicitly marked `previewOnly` and uses untracked source fallback; it is not operational stock.
- Preview responses and metadata are noindex. The banner states that orders, messages and advertising are disabled.

Production domain aliases, payment methods, database settings, advertising campaigns/budgets, Google/OpenAI channels and organic publishing are unchanged. This preview is not a production release.

## Validation

TypeScript, scoped ESLint, whitespace checks, offline privacy/Meta/checkout/card/newsletter suites, and targeted preview-isolation checks. Browser QA covers desktop 1440px and mobile 390/320px, actual gate, cookie decline, responsive cards, batch links, cart totals/quantity/removal, 48px checkout inputs and required-field errors. Provider payments are intentionally excluded from preview.

Genuine production event receipt and real provider payment/3-D Secure flows are not claimed by this visual refresh. Original image/report files remain unchanged; responsive image delivery is handled by Next Image. Original vector logo and authentic batch photography remain future inputs.
