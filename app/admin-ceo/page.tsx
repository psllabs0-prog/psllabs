import type { Metadata } from "next";

import { AdminCeoBriefDashboard } from "@/components/admin/admin-ceo-brief-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin CEO Brief",
  description: "Weekly operating brief for PSL Labs.",
  path: "/admin-ceo",
});

export const dynamic = "force-dynamic";

export default async function AdminCeoPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin CEO brief unavailable
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
            Admin CEO brief
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to generate and review the weekly operating brief.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-ceo" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-4xl">
        <AdminCeoBriefDashboard />
      </div>
    </main>
  );
}
