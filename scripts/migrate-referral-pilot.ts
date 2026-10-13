import { loadEnvLocal } from "./_env";
import { migrateReferralPilot, verifyReferralPilotSchema } from "@/lib/partners/referral-store";

loadEnvLocal();
if (!process.argv.includes("--apply")) {
  console.error("No changes made. Pass --apply for the additive referral-pilot tables and functions. No partners, orders, payments, or emails are created.");
  process.exitCode = 1;
} else {
  migrateReferralPilot().then(verifyReferralPilotSchema).then(() => console.log("Referral pilot schema verified. No partners approved, no emails sent, and no payouts activated.")).catch(() => {
    console.error("Referral pilot migration failed. Check existing partner/order/finance schema and access.");
    process.exitCode = 1;
  });
}
