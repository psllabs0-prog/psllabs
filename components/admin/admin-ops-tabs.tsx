"use client";

import { useState } from "react";

import { AdminOpsDashboard } from "@/components/admin/admin-ops-dashboard";
import { MissionControl } from "@/components/admin/mission-control";

export type AdminOpsTab = "overview" | "mission-control";

const TABS: Array<{ id: AdminOpsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "mission-control", label: "Mission Control" },
];

export function AdminOpsTabs({ initialTab }: { initialTab: AdminOpsTab }) {
  const [tab, setTab] = useState<AdminOpsTab>(initialTab);

  function select(next: AdminOpsTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <nav
        role="tablist"
        aria-label="Operations views"
        className="mx-auto mb-8 flex max-w-5xl gap-6 border-b border-zinc-200 text-sm"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => select(t.id)}
            className={`-mb-px border-b-2 pb-2 ${
              tab === t.id
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ash hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        <a href="/admin-social" className="ml-auto pb-2 text-ash hover:text-ink">
          X post queue
        </a>
      </nav>
      {tab === "overview" ? (
        <div className="mx-auto max-w-3xl">
          <AdminOpsDashboard />
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <MissionControl />
        </div>
      )}
    </div>
  );
}
