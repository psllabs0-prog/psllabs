"use client";

import Link from "next/link";
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
      <nav aria-label="Operations" className="mx-auto mb-8 flex max-w-5xl flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-zinc-200 text-sm">
        <div role="tablist" aria-label="Operations views" className="flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => select(t.id)}
            className={`-mb-px min-h-11 border-b-2 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              tab === t.id
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ash hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/admin-acquisition" className="inline-flex min-h-11 items-center py-2 text-ash hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Marketing
          </Link>
          <Link href="/admin-partners" className="inline-flex min-h-11 items-center py-2 text-ash hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Partners
          </Link>
          <Link href="/admin-social" className="inline-flex min-h-11 items-center py-2 text-ash hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            X post queue
          </Link>
        </div>
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
