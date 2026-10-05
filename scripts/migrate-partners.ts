import { loadEnvLocal } from "./_env";
import { migratePartners } from "@/lib/partners/store";

loadEnvLocal();
if (!process.argv.includes("--apply")) {
  console.error("No changes made. Pass --apply to create the acquisition_partners table. Existing tables are not modified.");
  process.exitCode = 1;
} else {
  migratePartners().then(() => console.log("Partner table ready. No contacts created or emails sent.")).catch(() => {
    console.error("Partner migration failed. Check database access and retry.");
    process.exitCode = 1;
  });
}
