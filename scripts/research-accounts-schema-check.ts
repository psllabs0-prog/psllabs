import assert from "node:assert/strict";

type QualificationConstraint = { expression: string; validated: boolean };

/** Match the parsed, canonical PostgreSQL expressions, never a column substring. */
export function assertReviewedQualificationConstraints(rows: QualificationConstraint[]) {
  // Strip PostgreSQL's formatting outside quoted literals/identifiers only.
  // Text inside a role literal remains exact, including spaces/parentheses.
  const canonical = (value: string) => value.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\s+|[()]|::text/g,
    token => token.startsWith("'") || token.startsWith('"') ? token : "");
  const required = [
    '"ageConfirmed"=true',
    '"researchUseConfirmed"=true',
    '"researchStatus"=ANYARRAY[\'academic_institutional\',\'commercial_laboratory\',\'independent_researcher\']',
  ];
  const validated = rows.filter(row => row.validated === true).map(row => canonical(row.expression));
  for (const expression of required) assert.ok(validated.includes(expression), "Exact validated research qualification CHECK required.");
}
