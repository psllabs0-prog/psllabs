import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminWorkspace } from "@/components/admin/admin-workspace";
import { isAdminAuthenticated, isAdminPasswordConfigured } from "@/lib/admin/auth";
import { adminViewHref } from "@/lib/admin/navigation";
import { loadAdminWorkspace } from "@/lib/admin/workspace-access";
import { loadWorkspaceInventory } from "@/lib/admin/workspace-inventory";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Admin",
    description: "PSL Labs admin workspace.",
    path: "/admin",
  }),
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { view } = await searchParams;
  const access = await loadAdminWorkspace(view, {
    isPasswordConfigured: isAdminPasswordConfigured,
    isAuthenticated: isAdminAuthenticated,
    loadInventory: loadWorkspaceInventory,
  });

  if (access.status !== "ready") {
    return (
      <main className="min-h-screen bg-page px-6 py-12 md:px-16">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-display-lg font-bold text-ink">PSL Labs Admin</h1>
          {access.status === "unavailable" ? (
            <p className="mt-3 text-sm text-ash">Admin sign-in is not configured.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ash">Sign in to review orders, marketing, and what needs your attention.</p>
              <div className="mt-8"><AdminLoginForm redirectTo={adminViewHref(access.view)} /></div>
            </>
          )}
        </div>
      </main>
    );
  }

  return <AdminWorkspace selectedView={access.view} inventory={access.inventory} inventoryUnavailable={access.inventoryUnavailable} />;
}
