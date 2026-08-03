import { loadEnvLocal } from "./_env";
import { ensureDiscountCodesSchema } from "@/lib/checkout/discount-codes";
import { ensureInventorySchema, setProductStock } from "@/lib/inventory/store";
import { ensureNewsletterSchema } from "@/lib/newsletter/store";
import { ensureOrdersSchema } from "@/lib/orders/store";

loadEnvLocal();

async function main() {
  await ensureOrdersSchema();
  await ensureInventorySchema();
  await ensureDiscountCodesSchema();
  await ensureNewsletterSchema();

  await setProductStock(
    "reconstitution-solution",
    "Reconstitution Solution",
    50
  );
  await setProductStock("ghk-cu", "GHK-Cu", 0);
  await setProductStock("bpc-157", "BPC-157", 0);
  await setProductStock("mots-c", "MOTS-c", 0);
  await setProductStock("tesamorelin", "Tesamorelin", 0);
  await setProductStock("kpv", "KPV", 0);

  console.log(
    "Seeded reconstitution-solution (stock 50) and coming-soon SKUs (stock 0). Discount codes cleared. Newsletter schema ready."
  );
  console.log(
    "Note: product prices live in TypeScript (lib/products), not the inventory table."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
