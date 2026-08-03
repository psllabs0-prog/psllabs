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
    "Discount schema ready. All discount_codes rows cleared (codes disabled)."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
