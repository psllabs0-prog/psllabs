---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Incident escalation

Sources: support escalation notify, ops exceptions, decision engine digests, CEO brief, finance reconciliation warnings.

## Owner (Luke)

Primary owner for unresolved YELLOW/RED support, finance mismatches, fulfillment holds, inventory monitor alerts, and decision-engine owner actions.

## Support incidents

- Open escalations notify via support escalation email path (admin URL `/admin-support`).
- Customer auto-send kill switch does **not** block internal Luke escalation notification retries.
- Spam/vendor: no urgent escalate.

## Finance incidents

- Reconciliation warning types listed in [finance/finance-rules.md](../finance/finance-rules.md).
- Review in `/admin-finance` / ops board.

## Fulfillment / label incidents

- BTCPostage `needs_review` after uncertain purchase: do not buy a second label; retrieve/review first.
- Manual holds appear on `/admin-fulfillment`.

## Ops / decision / CEO surfaces

- `/admin-ops` — aggregated exceptions
- `/admin-decisions` — decision engine
- `/admin-ceo` — weekly brief

## Cron / job failures

- Failed cron/job runs should surface via existing job recording / ops exceptions where implemented.
- Overlapping support inbox runs are lease-protected (stale lease window defined in support constants).

**NEEDS OWNER CONFIRMATION:** Preferred on-call channel beyond email admin notifications (SMS/phone/etc.) is not defined in repo.
