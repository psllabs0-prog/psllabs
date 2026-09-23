---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Shipping

Source: `lib/content/shipping.ts`, `lib/cart/constants.ts`, support knowledge `policy:shipping`.

## Coverage

- Physical addresses in all **50 U.S. states**, from **Phoenix, Arizona**.
- **No international** shipping.
- **No freight forwarders**.
- Address questions: contact `support@psllabs.org` before ordering.

## Processing

- Pack and ship within **1–2 business days** after payment clears (Mon–Fri, excluding U.S. federal postal holidays).
- Weekend/holiday orders enter the queue the next business day.

## Transit

- After carrier acceptance, standard domestic transit typically **~3–5 business days** (estimate, not a guarantee).

## Rates

- Standard domestic: **$9.99** when product subtotal is under **$100**.
- Free standard U.S. shipping at product subtotal **$100+**.

## Tracking

- Shipping email with tracking when label/tracking is saved through the PSL workflow.
- Customers can check `/track` with email + order number.
- Carrier scans may take up to ~24 hours after label creation to appear.

## Lost / damaged

- No movement >5 business days, or delivered-but-missing: email support with order number.
- Damaged: report promptly with photos; see `/returns` and public claim-window notice in `lib/content/testing-scope.ts`.
