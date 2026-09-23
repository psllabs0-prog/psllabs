---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Fulfillment SOP

Sources: `lib/fulfillment/schema.ts`, `lib/fulfillment/store.ts`, `lib/fulfillment/packing-slip.ts`, `components/admin/admin-fulfillment-dashboard.tsx`, `lib/btcpostage/*`, `app/api/admin/tracking/route.ts`.

## Board eligibility

Paid orders without a tracking number (and not finance reporting-excluded) appear on `/admin-fulfillment`.

## Warehouse workflow statuses

`ready` → `packing` → `packed`, or `hold`.

Admin actions: start packing, mark packed, place/remove manual hold, packing slip.

## Packing slip

- Operational packing list HTML only.
- Must not contain medical/dosing language.
- Includes legal entity + RUO footer.

## Labels (BTCPostage)

On `/admin-fulfillment` for eligible paid unshipped orders:

1. Verify address
2. Confirm weight (lbs/oz) and package dimensions (default **6 × 4 × 3** in depth×width×height; package type Parcel)
3. Get rates → select carrier/service
4. Buy label (explicit confirmation; spends credits when test mode is off)
5. Open / print 4×6 label manually (no auto-print)
6. **Do not** auto-mark the order shipped merely because a label was created

Duplicate purchase prevention: one successful stored purchase per PSL order; uncertain/timeout → needs review / retrieve — no blind retry.

`BTCPOSTAGE_TEST_MODE=true`: USPS test labels only; not real customer shipments.

## Tracking / ship notification

- Confirm tracking on `/admin-ledger` via existing tracking save flow.
- Saving tracking sets order `shipped` and may send the customer shipped email (existing semantics).
- Real (non-test) BTCPostage tracking is suggested/prefilled for ledger confirmation; test labels are not treated as real shipments.

**NEEDS OWNER CONFIRMATION:** Exact physical ship-from address details live in env (`BTCPOSTAGE_FROM_*`) — do not copy secrets or full address credentials into this folder.
