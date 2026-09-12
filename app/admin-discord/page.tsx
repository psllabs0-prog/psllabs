import type { Metadata } from "next";

import { AdminDiscordDashboard } from "@/components/admin/admin-discord-dashboard";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import {
  isAdminAuthenticated,
  isAdminPasswordConfigured,
} from "@/lib/admin/auth";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Admin Discord",
  description: "Discord community agent for PSL Labs.",
  path: "/admin-discord",
});

export const dynamic = "force-dynamic";

export default async function AdminDiscordPage() {
  if (!isAdminPasswordConfigured()) {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Admin Discord unavailable
          </h1>
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
            Discord community agent
          </h1>
          <div className="mt-8">
            <AdminLoginForm redirectTo="/admin-discord" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-3xl">
        <AdminDiscordDashboard />
      </div>
    </main>
  );
}
