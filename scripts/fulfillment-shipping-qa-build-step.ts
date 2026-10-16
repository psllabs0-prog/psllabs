import { spawnSync } from "node:child_process";
import { assertQaBuildEnvironment, QA_BUILD_FLAG, QA_RECIPIENT } from "./fulfillment-shipping-qa-guards";

/** Operator-only prebuild. This flag must be a one-build value, not a stored setting. */
if (process.env.PSL_FULFILLMENT_QA === QA_BUILD_FLAG) {
  assertQaBuildEnvironment(process.env);
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/test-fulfillment-shipping-pg.ts", "--run-isolated-qa", "--environment", "--provider-test", "--send-test-email", `--recipient=${QA_RECIPIENT}`], {
    stdio: "inherit", env: process.env,
  });
  if (result.error || result.status !== 0) throw new Error("Isolated fulfillment QA failed; do not promote this staged deployment.");
}
