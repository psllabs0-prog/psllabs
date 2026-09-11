import { getActiveCatalogProducts } from "@/lib/products/catalog";
import { getAvailabilityForHandles } from "@/lib/inventory/store";

/**
 * Customer-facing availability from sellable stock only
 * (stock − reservations). Never exposes inbound/pipeline.
 */
export async function lookupSellableAvailabilitySummary(
  productHint?: string | null
): Promise<{ text: string; sources: string[] }> {
  const products = getActiveCatalogProducts();
  const availabilityRows = await getAvailabilityForHandles(
    products.map((p) => p.handle)
  );
  const availability = new Map(
    availabilityRows.map((row) => [row.handle, row] as const)
  );

  const lines: string[] = [
    "Current customer-sellable availability (not a promise of future restock):",
  ];

  const hint = productHint?.toLowerCase() ?? "";
  for (const product of products) {
    if (
      hint &&
      !product.name.toLowerCase().includes(hint) &&
      !product.handle.includes(hint) &&
      !product.sku.toLowerCase().includes(hint)
    ) {
      continue;
    }
    const row = availability.get(product.handle);
    const status = row?.status ?? "out_of_stock";
    const label =
      status === "out_of_stock"
        ? "currently unavailable to purchase"
        : status === "low_stock"
          ? "limited sellable stock"
          : "available to purchase";
    lines.push(`- ${product.name}: ${label}`);
  }

  if (lines.length === 1) {
    lines.push("- No matching active catalog product found for that name.");
  }

  return {
    text: lines.join("\n"),
    sources: ["neon:sellable_availability"],
  };
}
