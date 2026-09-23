---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Escalation rules

## Support risk model (live)

Sources: `lib/support/constants.ts`, `lib/support/classify.ts`, `lib/support/draft.ts`.

Risk levels: **GREEN**, **YELLOW**, **RED**.

### When classification escalates (`shouldEscalateClassification`)

- YELLOW or RED risk
- Confidence below high-confidence threshold (`0.85`)
- Category `human_use_request`
- Category `other`
- `autoResponseAllowed` is false

Spam / vendor solicitation categories do **not** create urgent Luke escalations.

### Auto-send vs owner review (live outbound policy)

- Autonomous customer send is gated by `SUPPORT_AUTO_SEND_ENABLED=true`.
- **Only GREEN routine cases** (and the fixed human-use boundary reply when enabled) may auto-send.
- **YELLOW / RED:** owner review — no autonomous customer send.
- Human-use: may send the fixed RUO boundary text when auto-send is on, and **always escalates** for owner awareness.

### RED categories (examples from classifier)

Chargeback, fraud, legal, regulatory, security, refund_request.

### YELLOW categories (examples from classifier)

Damaged / wrong / missing item, returns, documentation mismatch, payment declined, batch report missing, restock, and unmatched “other” at low confidence.

## Order / delivery claims window

Source: `lib/content/testing-scope.ts`.

- Public notice: report issues promptly after carrier-confirmed delivery with order number and clear photos.
- Fixed numeric claim deadline: **NEEDS OWNER CONFIRMATION** (counsel placeholder exists; not published).
