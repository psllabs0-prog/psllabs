---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Content & marketing email policy

Sources: `lib/content/*`, `lib/retention/config.ts`, `lib/content/privacy.ts`, Plausible notes in `README.md`.

## Public content surfaces (governed by legal/content modules)

Routes backed by `lib/content/` (and related pages): `/terms`, `/privacy`, `/disclaimer`, `/shipping`, `/returns`, `/faq`, `/testing`, `/coa`, `/science`, `/protocol`, `/guides/*`, `/contact`, `/about`, `/products`.

Policy dates for terms/privacy are explicit constants in `lib/content/testing-scope.ts` (last updated **September 8, 2026** for those documents).

## Retention email

- Campaign key: `post_purchase_30d_v1`.
- Subject concept coded as availability & batch documentation messaging.
- Default delay: **30 days** (configurable).
- Auto-send requires `RETENTION_AUTO_SEND_ENABLED=true` plus marketing from email, postal address, and unsubscribe secret readiness checks.
- Unsubscribe: `/unsubscribe` and `/api/marketing/unsubscribe`.

**NEEDS OWNER CONFIRMATION:** Whether retention auto-send is intentionally enabled in production at any given time (env-gated; not stored in this folder).

## Analytics

- Plausible events referenced in README include `checkout_started`, `newsletter_signup`, `purchase`.
- Privacy page describes cookieless analytics posture and no sale of PII (`lib/content/privacy.ts`).

## Content claims

All marketing/content must obey [compliance/claims-rules.md](../compliance/claims-rules.md) and [compliance/prohibited-content.md](../compliance/prohibited-content.md).
