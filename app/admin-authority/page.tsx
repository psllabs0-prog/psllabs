import type { Metadata } from "next";

import { AdminAuthorityDashboard } from "@/components/admin/admin-authority-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Authority",
  description: "SEO and content authority engine for PSL Labs.",
  path: "/admin-authority",
});

export const dynamic = "force-dynamic";

export default async function AdminAuthorityPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin authority unavailable
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
            PSL Labs Authority Engine
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to review Search Console opportunities and content briefs.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-authority" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-4xl">
        <AdminAuthorityDashboard />
      </div>
    </main>
  );
}
