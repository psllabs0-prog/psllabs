---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Agent permissions

Derived from live kill switches and guardrails in code. Agents must not exceed these.

## Global

- Do not invent PSL policies or medical/dosing guidance.
- Do not store or echo secrets (API keys, passwords, private keys, bank/crypto credentials, customer PII beyond what an authenticated admin session already requires).
- Prefer repository / ops-knowledge sources over guessing.

## Support agent

**May**

- Process only eligible website contact-form messages.
- Classify GREEN/YELLOW/RED and draft from approved knowledge.
- Auto-send only when `SUPPORT_AUTO_SEND_ENABLED=true` and outbound rules allow (GREEN routine / fixed human-use boundary).
- Escalate YELLOW/RED and human-use for owner review.
- Ignore spam/vendor solicitation without customer reply.

**Must not**

- Mutate non–contact-form inbox mail.
- Reply to `support@psllabs.org` as the customer.
- Promise refunds/replacements.
- Auto-send YELLOW/RED acknowledgments.

## Discord agent

**May** answer from approved knowledge with RUO boundaries.

**Must not** expose order PII in channel answers.

## Decision engine / CEO brief / ops

**May** summarize coded operational signals and propose owner actions.

**Must not** invent SLA breaches when SLA is not configured; must not fabricate financial totals.

## Fulfillment / BTCPostage (admin-assisted)

**May** verify address, quote rates, purchase labels under admin confirmation and duplicate-safety rules.

**Must not** auto-print, auto-mark shipped on label create, or blind-retry uncertain purchases.

## Retention / marketing

**May** send only when retention readiness + `RETENTION_AUTO_SEND_ENABLED` allow.

**Must not** turn restricted human-use themes into marketing opportunities.

## Finance

**May** reconcile and flag warnings per coded types.

**Must not** invent expense categories or silently reverse reporting-exclusion without owner action.
