import { loadEnvLocal } from "./_env";
import { ensureRequestRateLimitSchema } from "@/lib/security/request-rate-limit";

loadEnvLocal();
if (!process.argv.includes("--apply")) {
  console.error("No changes made. Use --apply to add the request protection table.");
  process.exitCode = 1;
} else {
  ensureRequestRateLimitSchema().then(() => console.log("Request protection table ready. No order, payment or customer records changed."))
    .catch(() => { console.error("Request protection setup failed. Check database access."); process.exitCode = 1; });
}
