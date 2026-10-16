import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { ManualFulfillmentTestPanel } from "@/components/admin/manual-fulfillment-test-panel";
import { isAdminAuthenticated, isAdminPasswordConfigured } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "Fulfillment test — PSL Labs",
  description: "Private manual test order for shipping labels and tracking email.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function ManualFulfillmentTestPage() {
  const configured = isAdminPasswordConfigured();
  const authenticated = configured && await isAdminAuthenticated();

  return (
    <main className="min-h-screen bg-page px-6 py-12 md:px-16 lg:px-24">
      <div className="mx-auto max-w-4xl">
        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">PSL Labs / manual test</p>
          <h1 className="mt-3 font-display text-display-lg font-bold text-ink">Try the shipping flow</h1>
          <p className="mt-2 text-sm leading-relaxed text-ash">A separate fake order lets you test each step yourself.</p>
        </header>
        {!configured ? <p className="text-sm text-ash">Admin fulfillment is unavailable until admin sign-in is configured.</p> : !authenticated ? <AdminLoginForm redirectTo="/admin-fulfillment/test" /> : <ManualFulfillmentTestPanel />}
      </div>
    </main>
  );
}
