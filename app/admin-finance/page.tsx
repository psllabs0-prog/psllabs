import type { Metadata } from "next";

import { AdminFinanceDashboard } from "@/components/admin/admin-finance-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Finance",
  description: "Internal payment-event and sheet-sync status for PSL Labs.",
  path: "/admin-finance",
});

export const dynamic = "force-dynamic";

export default async function AdminFinancePage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin finance unavailable
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
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-bold text-ink">
            Admin finance
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to view payment events and reconciliation warnings.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-finance" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <AdminFinanceDashboard />
      </div>
    </main>
  );
}
