---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Automation system map

Sources: `vercel.json`, `app/api/cron/*`, `app/admin-*`, `lib/*` agent modules.

## Scheduled crons (UTC, from `vercel.json`)

| Path | Schedule |
|------|----------|
| `/api/cron/customer-intelligence` | `0 10 * * 0` (Sunday) |
| `/api/cron/paid-acquisition-sync` | `0 11 * * *` |
| `/api/cron/retention-30d` | `0 12 * * *` |
| `/api/cron/search-console-sync` | `0 13 * * *` |
| `/api/cron/delivery-followup` | `0 14 * * *` |
| `/api/cron/inventory-monitor` | `0 15 * * *` |
| `/api/cron/weekly-ceo-brief` | `0 15 * * 1` (Monday) |
| `/api/cron/finance-reconcile` | `30 15 * * *` |
| `/api/cron/support-inbox` | `0 16 * * *` |
| `/api/cron/decision-engine` | `0 17 * * *` |

Note: older README text may still mention `/api/cron/low-stock`; scheduled inventory path is **inventory-monitor**.

## Admin surfaces

`/admin-support`, `/admin-fulfillment`, `/admin-inventory`, `/admin-ledger`, `/admin-finance`, `/admin-ops`, `/admin-ceo`, `/admin-decisions`, `/admin-discord`, `/admin-retention`, `/admin-acquisition`, `/admin-customer-intelligence`, `/admin-data`, `/admin-attribution`, `/admin-authority`, `/admin-intelligence`.

## Major automated systems

| System | Code area | Role |
|--------|-----------|------|
| Support inbox agent | `lib/support/` | Contact-form classify / draft / escalate / optional auto-send |
| BTCPostage labels | `lib/btcpostage/` | Address verify, rates, label buy (admin) |
| Finance reconcile | `lib/finance/` | Provider vs PSL reconciliation + sheet sync |
| Inventory monitor | `lib/inventory/monitor/` | Stock risk alerts |
| Retention | `lib/retention/` | Post-purchase marketing email |
| Discord | `lib/discord/` | Community Q&A within knowledge bounds |
| Decision engine | `lib/decision-engine/` | Cross-business decisions + digest |
| CEO brief | `lib/ceo-brief/` | Weekly owner brief |
| Ops exceptions | `lib/ops/` | Aggregated exception board |
| Customer intelligence | `lib/customer-intelligence/` | Themes / demand (guardrailed) |
| Authority | `lib/authority/` | Claims/risk review briefs |

## Payment / order webhooks (not crons)

- BTCPay webhook: `/api/btcpay-webhook`
- Tagada webhook: `/api/tagada-webhook`
- Checkout APIs under `/api/checkout*`
