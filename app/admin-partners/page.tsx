import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminPartnersDashboard } from "@/components/admin/admin-partners-dashboard";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Partner workspace | PSL Labs",
  description: "Private partner outreach and referral tracking workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPartnersPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-2xl font-bold text-ink">
            Partner workspace unavailable
          </h1>
          <p className="mt-3 text-sm text-ash">
            Administrator sign-in needs to be configured before this workspace can open.
          </p>
        </div>
      </main>
    );
  }

  if (!(await isAdminAuthenticated())) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-bold text-ink">
            Partner workspace
          </h1>
          <p className="mt-3 text-sm text-ash">
            Sign in to review partners, outreach drafts, and referred orders.
          </p>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-partners" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-6xl">
        <AdminPartnersDashboard />
      </div>
    </main>
  );
}
