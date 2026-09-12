import type { Metadata } from "next";

import { AdminDataDashboard } from "@/components/admin/admin-data-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin External Data",
  description: "External metrics connectors for PSL Labs.",
  path: "/admin-data",
});

export const dynamic = "force-dynamic";

export default async function AdminDataPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin data unavailable
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
            Admin external data
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to review Search Console and paid acquisition connectors.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-data" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-3xl">
        <AdminDataDashboard />
      </div>
    </main>
  );
}
