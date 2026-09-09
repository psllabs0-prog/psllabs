import type { Metadata } from "next";

import { AdminCustomerFeedbackDashboard } from "@/components/admin/admin-customer-feedback-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Customer Feedback",
  description: "Internal customer intelligence responses.",
  path: "/admin-intelligence",
});

export const dynamic = "force-dynamic";

export default async function AdminIntelligencePage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin feedback unavailable
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
            Customer feedback
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to view optional post-purchase responses.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-intelligence" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <AdminCustomerFeedbackDashboard />
      </div>
    </main>
  );
}
