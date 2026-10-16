export type ManualFixtureStage = "validate_sender" | "connect_control" | "create_schema" | "verify_owner" |
  "connect_fixture" | "begin" | "lock" | "inventory_schema" | "finance_schema" | "workflow_schema" |
  "label_schema" | "shipping_schema" | "identity_schema" | "existing_fixture" | "catalog" | "seed_product" |
  "checkout" | "settlement" | "workflow" | "identity_marker" | "commit";

/** Only fixed stage names and a bounded SQLSTATE/category cross the admin boundary. */
export class ManualFixtureError extends Error {
  constructor(readonly stage: ManualFixtureStage, readonly operatorErrorCode: string) {
    super(`Test order creation stopped at ${stage} (${operatorErrorCode}). Refresh its saved status before another attempt.`);
    this.name = "ManualFixtureError";
  }
}
export function manualFixtureFailure(stage: ManualFixtureStage, error: unknown, rollbackSucceeded: boolean | null) {
  const rawCode = error && typeof error === "object" && "code" in error ? error.code : null;
  const operatorErrorCode = typeof rawCode === "string" && /^[0-9A-Z]{5}$/.test(rawCode) ? rawCode :
    rawCode === "ERR_ASSERTION" ? "GUARD_FAILED" : "SEED_FAILED";
  console.warn("[manual-fulfillment-test]", { event: "fixture_seed_failed", stage, operatorErrorCode, rollbackSucceeded });
  return new ManualFixtureError(stage, operatorErrorCode);
}
