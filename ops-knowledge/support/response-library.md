---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Support response library

Approved snippets are loaded from `lib/support/knowledge.ts` (plus site FAQ items via `lib/content/site-faq.ts`). Agents must not invent alternate legal/RUO language.

## Fixed templates

### Human-use / research-use boundary

> PSL Labs products are for laboratory and research use only. They are not for human or animal administration, and we cannot provide dosing, injection, reconstitution for personal use, treatment, or medical guidance.
>
> If you have a question about an order, shipping, or batch documentation, reply with those details and we will help.

### YELLOW acknowledgment

> Thanks for contacting PSL Labs Support. We received your message and a team member will review it shortly. We will follow up with next steps — please do not assume a refund or replacement has been approved yet.

### RED receipt

> Thanks for contacting PSL Labs Support. We received your message and it has been routed for review. We will respond after a human review.

## Policy snippets (summarized from code)

| ID | Intent |
|----|--------|
| `policy:coa` | COAs on `/coa` and product pages; Janoshik Analytical; verify at verify.janoshik.com with task number; testing-scope statement |
| `policy:shipping` | 50 U.S. states from Phoenix; flat `$9.99`; free at `$100` subtotal; no international; 1–2 business day pack; ~3–5 day transit |
| `policy:returns` | Damaged/wrong/missing reviewed case-by-case; email support with order # + photos; no auto-approve refunds from mailbox |
| `policy:contact` | `support@psllabs.org`; track at `/track` with email + order number |
| `policy:research-use` | Same as human-use boundary |

FAQ Q&A pairs from `siteFaqItems` are also included in the approved library with category hints.

**Do not** invent refund/replacement promises in replies.
