"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import type { AdminViewId } from "@/lib/admin/navigation";
import type { AdminWorkspaceInventory } from "@/lib/admin/workspace-inventory";

import { AdminWorkspaceNav } from "./admin-workspace-nav";

function LoadingTool() {
  return <p role="status" className="py-8 text-sm text-ash">Loading this tool…</p>;
}

// Each dynamic import is a separate client boundary. Only the selected panel mounts,
// so hidden tools cannot fetch, poll, or initialize their workflows in the background.
const panels = {
  overview: dynamic(() => import("./admin-ops-dashboard").then((m) => m.AdminOpsDashboard), { loading: LoadingTool }),
  "weekly-brief": dynamic(() => import("./admin-ceo-brief-dashboard").then((m) => m.AdminCeoBriefDashboard), { loading: LoadingTool }),
  orders: dynamic(() => import("./admin-ledger-dashboard").then((m) => m.AdminLedgerDashboard), { loading: LoadingTool }),
  fulfillment: dynamic(() => import("./admin-fulfillment-dashboard").then((m) => m.AdminFulfillmentDashboard), { loading: LoadingTool }),
  support: dynamic(() => import("./admin-support-dashboard").then((m) => m.AdminSupportDashboard), { loading: LoadingTool }),
  marketing: dynamic(() => import("./admin-acquisition-dashboard").then((m) => m.AdminAcquisitionDashboard), { loading: LoadingTool }),
  partners: dynamic(() => import("./admin-partners-dashboard").then((m) => m.AdminPartnersDashboard), { loading: LoadingTool }),
  social: dynamic(() => import("./admin-social-dashboard").then((m) => m.AdminSocialDashboard), { loading: LoadingTool }),
  retention: dynamic(() => import("./admin-retention-dashboard").then((m) => m.AdminRetentionDashboard), { loading: LoadingTool }),
  search: dynamic(() => import("./admin-authority-dashboard").then((m) => m.AdminAuthorityDashboard), { loading: LoadingTool }),
  attribution: dynamic(() => import("./admin-attribution-dashboard").then((m) => m.AdminAttributionDashboard), { loading: LoadingTool }),
  finance: dynamic(() => import("./admin-finance-dashboard").then((m) => m.AdminFinanceDashboard), { loading: LoadingTool }),
  decisions: dynamic(() => import("./admin-decisions-dashboard").then((m) => m.AdminDecisionsDashboard), { loading: LoadingTool }),
  "customer-insights": dynamic(() => import("./admin-customer-intelligence-dashboard").then((m) => m.AdminCustomerIntelligenceDashboard), { loading: LoadingTool }),
  feedback: dynamic(() => import("./admin-customer-feedback-dashboard").then((m) => m.AdminCustomerFeedbackDashboard), { loading: LoadingTool }),
  data: dynamic(() => import("./admin-data-dashboard").then((m) => m.AdminDataDashboard), { loading: LoadingTool }),
  discord: dynamic(() => import("./admin-discord-dashboard").then((m) => m.AdminDiscordDashboard), { loading: LoadingTool }),
  automation: dynamic(() => import("./mission-control").then((m) => m.MissionControl), { loading: LoadingTool }),
} satisfies Record<Exclude<AdminViewId, "inventory">, unknown>;

const Inventory = dynamic(() => import("./admin-inventory-dashboard").then((m) => m.AdminInventoryDashboard), { loading: LoadingTool });
const NewsletterWelcome = dynamic(() => import("./admin-newsletter-welcome-panel").then((m) => m.AdminNewsletterWelcomePanel), { loading: LoadingTool });

export function AdminWorkspace({ selectedView, inventory, inventoryUnavailable }: {
  selectedView: AdminViewId;
  inventory?: AdminWorkspaceInventory;
  inventoryUnavailable: boolean;
}) {
  const router = useRouter();
  const Panel = selectedView === "inventory" ? null : panels[selectedView];

  return (
    <main className="min-h-screen bg-page px-4 py-6 sm:px-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-7xl">
        <AdminWorkspaceNav selectedView={selectedView} />
        <div key={selectedView} data-admin-view={selectedView}>
          {selectedView === "inventory" ? (
            <div className="space-y-8">
              <header>
                <h1 className="font-display text-display-lg font-bold text-ink">Inventory</h1>
                <p className="mt-3 text-sm text-ash">Sellable stock, incoming shipments, and release controls.</p>
              </header>
              {inventoryUnavailable || !inventory ? (
                <section className="premium-card p-6">
                  <p role="alert" className="text-sm text-ash">Inventory could not be loaded. Stock levels are unavailable.</p>
                  <button type="button" onClick={() => router.refresh()} className="mt-4 min-h-11 rounded-lg border border-linen px-4 text-sm text-ink">Try again</button>
                </section>
              ) : <Inventory products={inventory.products} history={inventory.history} />}
            </div>
          ) : (
            <>
              {selectedView === "support" && (
                <header className="mb-8">
                  <h1 className="font-display text-display-lg font-bold text-ink">Customer support</h1>
                  <p className="mt-3 text-sm text-ash">Review messages, drafts, and escalations.</p>
                </header>
              )}
              {selectedView === "automation" && (
                <header className="mb-8">
                  <h1 className="font-display text-display-lg font-bold text-ink">Automation health</h1>
                  <p className="mt-3 text-sm text-ash">Mission Control: recent activity and connection status.</p>
                </header>
              )}
              {Panel && <Panel />}
              {selectedView === "retention" && <NewsletterWelcome />}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
