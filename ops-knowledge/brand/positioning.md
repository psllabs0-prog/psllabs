---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Brand positioning

## Live / coded identity (source of truth)

Sources: `lib/branding.ts`, `lib/about.ts`, `lib/content/testing-scope.ts`, `lib/content/site-faq.ts`, `lib/content/disclaimer.ts`.

- **Legal entity:** PSL Group LLC (Phoenix, AZ referenced in support/legal footers).
- **Site title:** “PSL Labs: Synthetic Peptides for Laboratory Research”
- **Site description:** “Synthetic peptides for laboratory research. Third-party lab reports available for released lots.”
- **Positioning (live About):** Research peptides with published third-party lab reports customers can check themselves; clear labeling; batch documentation; research use only — not for human consumption or medical use.
- **Default public site URL (code default):** `https://www.psllabs.org` (`lib/seo.ts`).

## Mark colors (coded)

Source: `lib/branding.ts`.

- Navy / deep: `#0B0C0E`
- Ice / accent: `#2FB6E0`
- White/light mark: `#E8E9EB`

## Historical notes (not treated as live SoT)

Sources: `brand.md`, `about.md` — describe a longevity *supplement* framing (Foundation / Cellular Energy / Recovery, biohacker consumer audience).

**NEEDS OWNER CONFIRMATION:** Whether any longevity-supplement positioning in `brand.md` / `about.md` remains intentional marketing language, or is fully superseded by the peptide RUO identity in `lib/branding.ts` and `lib/about.ts`. Until confirmed, **live code and legal/content modules govern public positioning.**
