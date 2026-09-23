---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# PSL Labs — Ops Knowledge Index

Internal company knowledge base for brand, compliance, support, operations, finance, marketing, and automation.

**Rules for this directory**

- Facts here must come from repository source-of-truth (live code, legal/content modules, or verified ops docs).
- If something is uncertain, mark **NEEDS OWNER CONFIRMATION** — do not invent policy.
- Never store API keys, passwords, private keys, crypto credentials, bank credentials, customer PII, order addresses, or other secrets here.
- Application behavior is defined in code; this folder documents it for humans and agents.

**Status legend**

- `approved` — verified against current live source-of-truth in the repo.
- `draft` — present historically or partially, not fully reconciled; needs Luke review.

## Which document governs what

| Area | Governing document(s) |
|------|------------------------|
| Brand positioning & SEO identity | [brand/positioning.md](brand/positioning.md) |
| Voice / tone | [brand/voice.md](brand/voice.md) |
| Allowed / prohibited claims | [compliance/claims-rules.md](compliance/claims-rules.md), [compliance/prohibited-content.md](compliance/prohibited-content.md) |
| Escalation & RUO human-use boundary | [compliance/escalation-rules.md](compliance/escalation-rules.md) |
| Support automation & mailbox policy | [support/support-policy.md](support/support-policy.md) |
| Approved support reply text | [support/response-library.md](support/response-library.md) |
| Warehouse fulfillment | [operations/fulfillment-sop.md](operations/fulfillment-sop.md) |
| Inventory / stock | [operations/inventory-sop.md](operations/inventory-sop.md) |
| Shipping rates & destinations | [operations/shipping.md](operations/shipping.md) |
| COA / batch / lot documentation | [operations/quality-and-lot-traceability.md](operations/quality-and-lot-traceability.md) |
| Expense entry | [finance/expense-rules.md](finance/expense-rules.md) |
| Reconciliation & reporting | [finance/finance-rules.md](finance/finance-rules.md) |
| Social / Discord | [marketing/social-policy.md](marketing/social-policy.md) |
| Marketing email & content | [marketing/content-policy.md](marketing/content-policy.md) |
| System / cron / admin map | [automation/system-map.md](automation/system-map.md) |
| What agents may / may not do | [automation/agent-permissions.md](automation/agent-permissions.md) |
| Incidents & owner notify | [automation/incident-escalation.md](automation/incident-escalation.md) |

## Full document list

### Brand
- [brand/positioning.md](brand/positioning.md)
- [brand/voice.md](brand/voice.md)

### Compliance
- [compliance/claims-rules.md](compliance/claims-rules.md)
- [compliance/prohibited-content.md](compliance/prohibited-content.md)
- [compliance/escalation-rules.md](compliance/escalation-rules.md)

### Support
- [support/support-policy.md](support/support-policy.md)
- [support/response-library.md](support/response-library.md)

### Operations
- [operations/fulfillment-sop.md](operations/fulfillment-sop.md)
- [operations/inventory-sop.md](operations/inventory-sop.md)
- [operations/shipping.md](operations/shipping.md)
- [operations/quality-and-lot-traceability.md](operations/quality-and-lot-traceability.md)

### Finance
- [finance/expense-rules.md](finance/expense-rules.md)
- [finance/finance-rules.md](finance/finance-rules.md)

### Marketing
- [marketing/social-policy.md](marketing/social-policy.md)
- [marketing/content-policy.md](marketing/content-policy.md)

### Automation
- [automation/system-map.md](automation/system-map.md)
- [automation/agent-permissions.md](automation/agent-permissions.md)
- [automation/incident-escalation.md](automation/incident-escalation.md)

## Primary code / content sources (outside this folder)

| Topic | Repo path |
|-------|-----------|
| Site title / description | `lib/branding.ts` |
| About (live) | `lib/about.ts` |
| Legal entity / testing scope | `lib/content/testing-scope.ts` |
| Disclaimer | `lib/content/disclaimer.ts` |
| Terms / privacy | `lib/content/terms.ts`, `lib/content/privacy.ts` |
| Shipping / returns / FAQ | `lib/content/shipping.ts`, `lib/content/returns.ts`, `lib/content/site-faq.ts` |
| Support classify / draft / knowledge | `lib/support/*` |
| Fulfillment | `lib/fulfillment/*` |
| BTCPostage | `lib/btcpostage/*` |
| Finance | `lib/finance/*`, `lib/ledger/*` |
| Cron schedules | `vercel.json` |
| Historical brand notes (may conflict) | `brand.md`, `about.md`, `claims.md`, `design-system.md` |
