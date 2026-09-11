import type { Metadata } from "next";

import { AdminSupportDashboard } from "@/components/admin/admin-support-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Support",
  description: "Internal support email agent queue and escalations.",
  path: "/admin-support",
});

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin support unavailable
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
            Admin support
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to review support classifications and escalations.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-support" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="mono text-ash">INTERNAL</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Support agent
          </h1>
          <p className="mt-3 text-sm text-ash">
            Classify, draft, escalate. Auto-send stays off until explicitly
            enabled.
          </p>
        </header>
        <AdminSupportDashboard />
      </div>
    </main>
  );
}
