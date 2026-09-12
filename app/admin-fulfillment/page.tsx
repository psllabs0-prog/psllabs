import type { Metadata } from "next";

import { AdminFulfillmentDashboard } from "@/components/admin/admin-fulfillment-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Fulfillment",
  description: "Warehouse pack and hold queue.",
  path: "/admin-fulfillment",
});

export const dynamic = "force-dynamic";

export default async function AdminFulfillmentPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin fulfillment unavailable
          </h1>
          <p className="mt-3 text-sm text-ash">
            Set <code className="font-mono">ADMIN_PASSWORD</code> to enable.
          </p>
        </div>
      </main>
    );
  }

  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-bold text-ink">
            Admin fulfillment
          </h1>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-fulfillment" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-5xl">
        <AdminFulfillmentDashboard />
      </div>
    </main>
  );
}
