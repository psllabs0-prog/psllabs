---
status: approved
owner: Luke
last_reviewed: 2026-09-23
---

# Quality and lot traceability

Sources: `lib/content/testing-scope.ts`, `lib/batch-reports/*`, `lib/support/knowledge.ts`, `/coa` / product pages, site FAQ.

## Scope of testing claims

- **“The report only covers the tests shown on the original laboratory file.”**
- Do not imply broader testing than the published report.

## COA / batch reports

- Certificates / batch reports are published on `/coa` and product pages where available.
- Reports referenced in support knowledge as produced by **Janoshik Analytical**.
- Customers can verify originals at **verify.janoshik.com** using the task number on the report.
- Batch report statuses in code include `report_available` and `pending` (`lib/batch-reports/types.ts`).
- Coded batch report modules exist for released lots of catalog products (e.g. Retatrutide, GHK-Cu, Tesamorelin, BPC-157, reconstitution solution) under `lib/batch-reports/`.

## Fulfillment documentation

- Packing slips are operational and RUO-framed; they are not clinical instructions.

## Claim / issue reporting

- Public notice: report order issues promptly after carrier-confirmed delivery with order number and clear photos.
- Fixed review deadline days: **NEEDS OWNER CONFIRMATION** (counsel placeholder; not published).
