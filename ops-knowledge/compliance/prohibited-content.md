---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Prohibited content

## Never in public / agent / support replies (live)

Sources: `lib/content/disclaimer.ts`, `lib/content/site-faq.ts`, `lib/support/knowledge.ts`, `lib/fulfillment/packing-slip.ts`, email legal footers.

- Human or animal consumption / administration guidance.
- Dosing, injection, reconstitution for personal use, treatment, or medical guidance.
- Presenting COAs or product copy as medical advice.

## Unsafe marketing claims listed in `claims.md`

Source: `claims.md` (treat as prohibited unless Luke re-approves otherwise):

- “Treats / cures / prevents / heals [anything]”
- “Anti-aging” as a verb claim (“anti-aging supplement”)
- “Boosts” / “increases” specific biomarkers without substantiation
- “Clinically proven” unless the product itself has clinical studies
- “Doctor recommended” without signed endorsement + substantiation file
- Weight loss claims of any kind
- “Replaces” or “alternative to” any prescription medication
- “Natural Ozempic,” “natural GLP-1,” or drug comparisons
- Before/after photography
- Specific outcome claims (“you will…”)

## Customer-intelligence / marketing guardrail

Source: `lib/customer-intelligence/guardrails.ts` (and related CI code).

- Restricted human-use themes must not be converted into marketing opportunities.

## Secrets / PII

Never put the following in this knowledge base or in public agent output:

- API keys, passwords, private keys, crypto credentials, bank credentials
- Customer PII, order addresses, full payment identifiers beyond what an authenticated admin tool already shows under access control
