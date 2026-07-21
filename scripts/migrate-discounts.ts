import { loadEnvLocal } from "./_env";
import { ensureDiscountCodesSchema } from "@/lib/checkout/discount-codes";
import { ensureOrdersSchema } from "@/lib/orders/store";
import { ensureInventorySchema } from "@/lib/inventory/store";

loadEnvLocal();

async function main() {
  await ensureOrdersSchema();
  await ensureInventorySchema();
  await ensureDiscountCodesSchema();
  console.log(
    "Discount schema ready. Seeded SUMMER20 and GRANDOPEN20 (20%, active, no expiry)."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
