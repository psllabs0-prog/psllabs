---
status: draft
owner: Luke
last_reviewed: 2026-09-23
---

# Expense rules

Sources: `lib/ledger/store.ts`, `app/api/admin/expense/route.ts`, `components/admin/admin-ledger-dashboard.tsx`.

## What exists in code today

- Ledger entries support types **SALE** and **EXPENSE**.
- Expenses use a free-text `expense_name` (length-limited in the admin API).
- There is **no coded expense-category taxonomy** (no enum of marketing / shipping / supplies / etc.).

## Operational practice (documented from UI behavior)

- Owner enters expenses through authenticated `/admin-ledger` (or related admin expense API).
- Do not invent category codes in automation until Luke defines them.

**NEEDS OWNER CONFIRMATION:** Approved expense category list, naming conventions, and which costs must never be auto-created by agents.
