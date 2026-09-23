---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Finance rules

Sources: `lib/finance/types.ts`, `lib/finance/reconciliation.ts`, `lib/finance/reporting-exclusion.ts`, `lib/finance/sheets-sync.ts`, `vercel.json`, `/admin-finance`, `/admin-ledger`.

## Providers

Payment providers referenced in finance types: **btcpay**, **tagada**, **authnet**.

## Reconciliation warning types

- `psl_paid_provider_not_settled`
- `provider_success_psl_missing`
- `amount_mismatch`
- `currency_mismatch`
- `duplicate_provider_payment_id`
- `provider_lookup_failed`

## Daily reconcile job

- Cron: `/api/cron/finance-reconcile` at `30 15 * * *` UTC.
- Job reviews recent paid orders against providers and may sync sheets (see finance modules).

## Reporting exclusion

- Owner-marked reporting exclusion is supported.
- Excluded transactions are skipped from Sheets sync (reported as reporting excluded).
- Some historical QA order IDs are hard-coded in reporting-exclusion logic.

**NEEDS OWNER CONFIRMATION:** Complete list of orders that should remain reporting-excluded beyond code defaults.

## Sheets

- Default revenue tab name referenced in code: `Revenue_Orders` (`lib/finance/google-sheets.ts`).
- Credentials live in environment — never document secret values here.

## Admin

- `/admin-finance` for finance ops
- `/admin-ledger` for KPI / inventory / tracking / expense entry surfaces used by Luke
