import type { AdminInventoryRow, StockHistoryRow } from "@/lib/inventory/store";

export type AdminWorkspaceInventory = {
  products: AdminInventoryRow[];
  history: StockHistoryRow[];
};

/** Same selected-page initialization as /admin-inventory. Call only after authentication. */
export async function loadWorkspaceInventory(): Promise<AdminWorkspaceInventory> {
  const [store, catalog] = await Promise.all([
    import("@/lib/inventory/store"),
    import("@/lib/products/catalog"),
  ]);
  await store.ensureInventorySchema();
  for (const product of catalog.getActiveCatalogProducts()) {
    await store.ensureProductTracked(product.handle, product.name, product.sku);
  }
  const [products, history] = await Promise.all([
    store.getAdminInventoryRows(),
    store.getRecentStockHistory(10),
  ]);
  return { products, history };
}
