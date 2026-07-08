import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { setProductStock } from "@/lib/inventory/store";

import { loadEnvLocal, parseStockArgs } from "./_env";

loadEnvLocal();

async function main() {
  const { product, qty } = parseStockArgs();

  if (!product || qty === null || !Number.isInteger(qty) || qty < 0) {
    console.error(
      "Usage: npm run set-stock -- --product=retatrutide --qty=110"
    );
    process.exit(1);
  }

  const catalog = getCatalogProductByHandle(product);
  const name = catalog?.name ?? product;

  await setProductStock(product, name, qty);
  console.log(`Set ${product} stock to ${qty}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
