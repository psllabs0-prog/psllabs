---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Claims rules

## Research-use / FDA framing (live)

Sources: `lib/content/disclaimer.ts`, `lib/content/testing-scope.ts`, `lib/content/terms.ts`.

- Products are sold **strictly for laboratory and research use only**.
- Not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.
- Product descriptions, testing summaries, and COAs support research documentation — they are not medical advice or usage guidance.
- Standard FDA disclaimer language is published on the disclaimer page:
  > These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.

## Testing-scope claim limit (live)

Source: `lib/content/testing-scope.ts`.

- Canonical statement: **“The report only covers the tests shown on the original laboratory file.”**
- Do not overstate lab methods or results beyond the published report.

## Age / RUO entry gate (live)

Source: `components/layout/ResearcherVerificationGate.tsx` (and related site gate).

- Site entry requires confirmation of age ≥21 and research-use-only (not human/veterinary use) before browsing.

## Historical structure/function list (`claims.md`)

Source: `claims.md` — written for longevity supplement structure/function claims.

Examples listed as “safe” there include phrases such as “Supports cellular health” / “Supports NAD+ levels” (with FDA disclaimer).

**NEEDS OWNER CONFIRMATION:** Whether the `claims.md` structure/function “safe” list still applies to the current peptide RUO catalog, or is legacy. Until confirmed, prefer RUO / testing-scope language from live content modules over structure/function supplement claims.
