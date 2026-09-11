import type { Metadata } from "next";

import { AdminInventoryDashboard } from "@/components/admin/admin-inventory-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import {
  getActiveCatalogProducts,
} from "@/lib/products/catalog";
import {
  ensureInventorySchema,
  ensureProductTracked,
  getAdminInventoryRows,
  getRecentStockHistory,
} from "@/lib/inventory/store";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Inventory Admin",
  description: "Internal inventory management for PSL Labs.",
  path: "/admin-inventory",
});

export const dynamic = "force-dynamic";

async function ensureTrackedProducts(): Promise<void> {
  await ensureInventorySchema();
  for (const product of getActiveCatalogProducts()) {
    await ensureProductTracked(product.handle, product.name, product.sku);
  }
}

export default async function AdminInventoryPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-paper px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Inventory admin unavailable
          </h1>
          <p className="mt-3 text-sm text-ash">
            Set <code className="font-mono">ADMIN_PASSWORD</code> in your
            environment to enable this page.
          </p>
        </div>
      </main>
    );
  }

  const authenticated = await isAdminAuthenticated();

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-paper px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-bold text-ink">
            Inventory admin
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to view and update product stock levels.
          </p>
          <div className="mt-8">
            <AdminLoginForm />
          </div>
        </div>
      </main>
    );
  }

  await ensureTrackedProducts();
  const [products, history] = await Promise.all([
    getAdminInventoryRows(),
    getRecentStockHistory(10),
  ]);

  return (
    <main className="min-h-screen bg-paper px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="mono text-ash">INTERNAL</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Inventory dashboard
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sellable stock, inbound pipeline (not sellable), velocity monitor,
            and explicit release controls for active catalog products.
          </p>
        </header>
        <AdminInventoryDashboard products={products} history={history} />
      </div>
    </main>
  );
}
