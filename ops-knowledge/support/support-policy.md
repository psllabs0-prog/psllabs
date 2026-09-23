---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Support policy

Sources: `lib/support/contact-form.ts`, `lib/support/constants.ts`, `lib/support/process.ts`, `lib/support/imap.ts`, `lib/support/draft.ts`, `app/api/contact/route.ts`.

## Mailbox eligibility (hard gate)

Support inbox automation processes a message **only** when both are true:

1. Subject begins with `[PSL Labs Contact]`
2. Body contains exactly `Source: PSL Labs Contact Form`

All other inbox mail (ordinary email to support@, internal `@psllabs.org`, vendor mail, etc.) is **completely ignored** — no classify, auto-reply, archive, label, mark handled, or other mutation by the automation.

## Customer reply recipient

For eligible contact-form messages:

1. Prefer explicit **Reply-To** if present and valid.
2. Otherwise parse the structured `Email:` field from the contact-form body.
3. Validate the address.
4. **Never** send a customer reply to `support@psllabs.org` (or other `@psllabs.org`) merely because that is the envelope From.

Website contact form itself sets `Reply-To` to the submitter and subject `[PSL Labs Contact] …` (`app/api/contact/route.ts`).

## Classification & auto-send

- GREEN / YELLOW / RED classification remains in force.
- Auto-send requires `SUPPORT_AUTO_SEND_ENABLED=true` (default off until Luke enables).
- High-confidence threshold for GREEN auto-send: `0.85`.
- Day-1 GREEN auto-send categories are listed in `lib/support/constants.ts` (`AUTO_SEND_GREEN_CATEGORIES`), including human_use_request for the **fixed boundary text only** (still escalates).
- YELLOW/RED: draft / escalate for owner review; no autonomous customer send.
- Spam / vendor solicitation: no customer email; no urgent Luke escalate; may be marked ignored.

## Duplicate safety

- Durable Neon handling + claim/lease prevents duplicate customer replies for the same provider message.
- Already-sent drafts cannot be sent again (`canSendCustomerReply` / `markResponseSent` semantics).

## Support address

- Public support email: `support@psllabs.org` (`lib/cart/constants.ts`).

## Cron

- `/api/cron/support-inbox` — daily `0 16 * * *` UTC (`vercel.json`).
