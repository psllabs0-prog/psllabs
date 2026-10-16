/** Idempotent migration only; never calls a carrier or SMTP. */
import { loadEnvLocal } from "./_env";
import { ensureShippingFlowSchema } from "../lib/fulfillment/shipping-flow-store";

loadEnvLocal();
void ensureShippingFlowSchema().then(() => {
  console.log("Fulfillment label previews and tracking outbox schema ready. Purchase/email settings were not changed.");
}).catch(() => {
  console.error("Fulfillment shipping schema migration failed. No label or email was requested.");
  process.exitCode = 1;
});
