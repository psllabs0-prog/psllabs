import type { Metadata } from "next";

import { AdminRetentionDashboard } from "@/components/admin/admin-retention-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Retention",
  description: "Post-purchase retention email controls.",
  path: "/admin-retention",
});

export const dynamic = "force-dynamic";

export default async function AdminRetentionPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin retention unavailable
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
            Admin retention
          </h1>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-retention" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-3xl">
        <AdminRetentionDashboard />
      </div>
    </main>
  );
}
