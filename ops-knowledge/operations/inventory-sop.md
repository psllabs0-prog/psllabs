---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Inventory SOP

Sources: `lib/inventory/*`, `lib/inventory/constants.ts`, `app/api/cron/inventory-monitor/route.ts`, `app/admin-inventory`, admin update-stock APIs.

## Principles

- Stock is maintained in Neon product inventory (admin `/admin-inventory` and related APIs).
- Paid-order settlement decrements stock through the existing settle/fulfill path (exactly-once intent in DB/application logic).
- Low-stock / inventory monitor runs on a schedule via `/api/cron/inventory-monitor` (`0 15 * * *` UTC in `vercel.json`).
- Compatibility note: older docs may mention `/api/cron/low-stock`; monitor is the scheduled path.

## Threshold

- Default low-stock threshold constant exists in code (`LOW_STOCK_THRESHOLD`, default **15** in `lib/inventory/constants.ts`) unless overridden by env/config used by the monitor.

## Admin

- Update stock through authenticated admin inventory tools only.
- Do not invent restock ETAs in customer replies unless confirmed in live inventory/admin data.

**NEEDS OWNER CONFIRMATION:** Preferred operational restock / inbound process beyond what the monitor alert already encodes.
